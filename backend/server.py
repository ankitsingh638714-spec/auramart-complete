from dotenv import load_dotenv
load_dotenv()

import os
import json
import uuid
import logging
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from html import escape
from urllib.parse import urlparse
from typing import Optional, List

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ORDER_STATUSES = ["pending", "confirmed", "dispatched", "delivered", "cancelled"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Auth ----------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"], "name": user.get("name", "Admin"), "role": user.get("role", "admin")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    return user


class LoginIn(BaseModel):
    email: str
    password: str


@api_router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    identifier = f"{request.client.host}:{email}"
    # Key lockout on the normalized email: request.client.host is the rotating
    # ingress pod IP behind the k8s proxy, so IP-keyed counting never accumulates.
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    attempts = await db.login_attempts.count_documents({"email": email, "created_at": {"$gte": since}})
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Locked for 15 minutes.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": identifier, "email": email, "created_at": datetime.now(timezone.utc)})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_many({"email": email})
    ver = user.get("token_version", 0)
    set_auth_cookies(response, create_access_token(user["id"], email, ver), create_refresh_token(user["id"], ver))
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    response.set_cookie("access_token", create_access_token(user["id"], user["email"], user.get("token_version", 0)),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return {"message": "refreshed"}


# -------- Password reset --------

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "AuraMart Luxe"


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = FRONTEND_URL.rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>We received a request to reset your {brand} password.</p>'
        f'<p><a href="{escape(link)}">Reset your password</a></p>'
        f'<p>This link expires in 1 hour and can be used once. If you did not request it, '
        f'ignore this email — your password is unchanged.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset your {EMAIL_FROM_NAME} password",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


GENERIC_RESET_RESPONSE = {"message": "If that email is registered, a reset link has been sent."}


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn, background_tasks: BackgroundTasks):
    email = body.email.strip().lower()
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    since_10m = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent = await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gte": since}})
    total_recent = await db.password_reset_requests.count_documents({"created_at": {"$gte": since_10m}})
    await db.password_reset_requests.insert_one({"email": email, "created_at": datetime.now(timezone.utc)})
    if recent >= 5 or total_recent >= 10:
        return GENERIC_RESET_RESPONSE
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        return GENERIC_RESET_RESPONSE
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"], "email": email,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
    })
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return GENERIC_RESET_RESPONSE


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now_iso()}},
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    await db.users.update_one(
        {"id": doc["user_id"]},
        {"$set": {"password_hash": hash_password(body.password)}, "$inc": {"token_version": 1}},
    )
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Password updated. You can now sign in."}


# ---------------- Products ----------------

class ProductIn(BaseModel):
    title: str
    description: str = ""
    category: str = ""
    price: float = 0
    wholesale_price: float = 0
    seo_tags: List[str] = []
    selling_points: List[str] = []
    image_url: str = ""
    source_link: str = ""
    status: str = "draft"


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/products")
async def list_products(user=Depends(get_current_user)):
    return [clean(p) for p in await db.products.find().sort("created_at", -1).to_list(500)]


@api_router.post("/admin/products")
async def create_product(body: ProductIn, user=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.products.insert_one(doc)
    return clean(doc)


@api_router.put("/admin/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(get_current_user)):
    res = await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return clean(await db.products.find_one({"id": pid}))


@api_router.delete("/admin/products/{pid}")
async def delete_product(pid: str, user=Depends(get_current_user)):
    res = await db.products.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "deleted"}


class GenerateProductIn(BaseModel):
    input_text: str
    wholesale_price: Optional[float] = None


@api_router.post("/admin/ai/generate-product")
async def ai_generate_product(body: GenerateProductIn, user=Depends(get_current_user)):
    if not LLM_KEY:
        raise HTTPException(status_code=500, detail="AI key not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system_msg = (
        "You are an elite luxury e-commerce copywriter and pricing strategist for AuraMart Luxe, "
        "a high-end dropshipping brand. You write viral, high-converting product content with an opulent tone."
    )
    prompt = f"""Product input (raw title or wholesale supplier link, e.g. Meesho): {body.input_text}
Wholesale cost in INR: {body.wholesale_price if body.wholesale_price else 'unknown - estimate a realistic one'}

Return ONLY a valid JSON object (no markdown, no commentary) with exactly these keys:
- "marketing_title": catchy viral luxury product title (max 90 chars)
- "description": persuasive 2-paragraph product description that converts
- "selling_points": array of exactly 4 short punchy selling points
- "seo_tags": array of exactly 8 SEO tags/keywords
- "category": single luxury category (e.g. "Horology & Timepieces", "Haute Parfumerie", "Leather Goods", "Fine Jewellery", "Home Opulence", "Fashion & Apparel")
- "suggested_price": number in INR, optimal retail price (3.5x-4x wholesale margin if known, otherwise realistic luxury pricing)
- "estimated_wholesale": number in INR (use provided cost or your estimate)
- "margin_note": one line explaining the pricing strategy"""
    chat = LlmChat(api_key=LLM_KEY, session_id=f"product-gen-{uuid.uuid4()}",
                   system_message=system_msg).with_model("openai", "gpt-5.4-mini")
    resp = await chat.send_message(UserMessage(text=prompt))
    text = resp.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text.strip())
    except Exception:
        logger.error(f"AI product generation returned non-JSON: {resp[:300]}")
        raise HTTPException(status_code=502, detail="AI returned an unexpected format. Please try again.")


# ---------------- Orders ----------------

class OrderItemIn(BaseModel):
    product_id: str
    qty: int = 1


class CustomerIn(BaseModel):
    name: str
    phone: str
    address: str
    city: str
    state: str
    pincode: str


class OrderIn(BaseModel):
    customer: CustomerIn
    items: List[OrderItemIn]


@api_router.post("/orders")
async def create_order(body: OrderIn):
    items = []
    total = 0.0
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Product not found")
        items.append({"product_id": p["id"], "title": p["title"], "price": p["price"],
                      "qty": it.qty, "image_url": p.get("image_url", "")})
        total += p["price"] * it.qty
    oid = str(uuid.uuid4())
    doc = {
        "id": oid,
        "order_no": f"AML-{oid[:8].upper()}",
        "customer": body.customer.model_dump(),
        "items": items,
        "total": round(total, 2),
        "status": "pending",
        "fulfillment": None,
        "created_at": now_iso(),
    }
    await db.orders.insert_one(doc)
    return clean(doc)


@api_router.get("/admin/orders")
async def list_orders(user=Depends(get_current_user)):
    return [clean(o) for o in await db.orders.find().sort("created_at", -1).to_list(1000)]


class StatusIn(BaseModel):
    status: str


@api_router.patch("/admin/orders/{oid}/status")
async def update_order_status(oid: str, body: StatusIn, user=Depends(get_current_user)):
    if body.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.orders.update_one({"id": oid}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return clean(await db.orders.find_one({"id": oid}))


class FulfillIn(BaseModel):
    provider: str = "shiprocket"


@api_router.post("/admin/orders/{oid}/fulfill")
async def fulfill_order(oid: str, body: FulfillIn, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    provider = body.provider.lower()
    if provider not in ("shiprocket", "delhivery", "local"):
        raise HTTPException(status_code=400, detail="Unsupported provider")
    awb = "AUR" + uuid.uuid4().hex[:10].upper()
    # Integration-ready payload: swap the mock block with the provider's create-shipment API call
    payload = {
        "provider": provider,
        "order_id": order["order_no"],
        "awb": awb,
        "pickup_location": "AuraMart Luxe Fulfillment Center",
        "customer": order["customer"],
        "items": [{"name": i["title"], "qty": i["qty"], "price": i["price"]} for i in order["items"]],
        "total": order["total"],
        "payment_mode": "prepaid",
        "weight_kg": 0.5,
    }
    fulfillment = {
        "provider": provider,
        "awb": awb,
        "status": "manifested",
        "tracking_url": f"https://track.example.com/{provider}/{awb}",
        "requested_at": now_iso(),
    }
    await db.orders.update_one({"id": oid}, {"$set": {"fulfillment": fulfillment, "status": "dispatched"}})
    return {"message": "Shipment manifested (integration hook ready)", "payload": payload, "fulfillment": fulfillment}


@api_router.delete("/admin/orders/{oid}")
async def delete_order(oid: str, user=Depends(get_current_user)):
    res = await db.orders.delete_one({"id": oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "deleted"}


@api_router.get("/admin/stats")
async def admin_stats(user=Depends(get_current_user)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
    revenue = sum(o["total"] for o in orders if o["status"] != "cancelled")
    by_status = {s: 0 for s in ORDER_STATUSES}
    for o in orders:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1
    products_live = await db.products.count_documents({"status": "published"})
    products_total = await db.products.count_documents({})
    recent = sorted(orders, key=lambda o: o["created_at"], reverse=True)[:5]
    return {
        "revenue": round(revenue, 2),
        "orders_total": len(orders),
        "by_status": by_status,
        "products_live": products_live,
        "products_total": products_total,
        "recent_orders": recent,
    }


# ---------------- Media / Banners ----------------

class BannerPromptIn(BaseModel):
    prompt: str


async def generate_banner_image(prompt: str) -> str:
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    image_gen = OpenAIImageGeneration(api_key=LLM_KEY)
    full_prompt = (
        "Ultra-wide cinematic luxury e-commerce hero banner for AuraMart Luxe, dark obsidian background, "
        "champagne gold accents, dramatic studio lighting, opulent product photography: " + prompt
    )
    images = await image_gen.generate_images(prompt=full_prompt, model="gpt-image-1", number_of_images=1)
    if not images:
        raise HTTPException(status_code=500, detail="No image was generated")
    fname = f"banner_{uuid.uuid4().hex}.png"
    with open(UPLOAD_DIR / fname, "wb") as f:
        f.write(images[0])
    return f"/api/uploads/{fname}"


@api_router.get("/admin/media")
async def list_media(user=Depends(get_current_user)):
    return [clean(b) for b in await db.banners.find().sort("created_at", -1).to_list(100)]


@api_router.post("/admin/media/generate-banner")
async def generate_banner(body: BannerPromptIn, user=Depends(get_current_user)):
    if not LLM_KEY:
        raise HTTPException(status_code=500, detail="AI key not configured")
    url = await generate_banner_image(body.prompt)
    doc = {"id": str(uuid.uuid4()), "type": "image", "prompt": body.prompt, "image_url": url,
           "video_url": None, "active": False, "status": "ready", "created_at": now_iso()}
    await db.banners.insert_one(doc)
    return clean(doc)


@api_router.post("/admin/media/generate-video")
async def generate_video(body: BannerPromptIn, user=Depends(get_current_user)):
    # Video integration hook: AI poster is generated now; plug Veo/Runway/Sora here to render the 10s cinematic clip
    if not LLM_KEY:
        raise HTTPException(status_code=500, detail="AI key not configured")
    poster_url = await generate_banner_image(body.prompt + " — cinematic film still, motion blur hints, anamorphic")
    doc = {
        "id": str(uuid.uuid4()), "type": "video", "prompt": body.prompt,
        "image_url": poster_url, "video_url": None, "active": False,
        "status": "poster_ready",
        "note": "Video provider hook: connect Veo/Runway/Sora API to render the 10-second cinematic banner",
        "created_at": now_iso(),
    }
    await db.banners.insert_one(doc)
    return clean(doc)


@api_router.post("/admin/media/{bid}/activate")
async def activate_banner(bid: str, user=Depends(get_current_user)):
    res = await db.banners.update_one({"id": bid}, {"$set": {"active": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    await db.banners.update_many({"id": {"$ne": bid}}, {"$set": {"active": False}})
    return clean(await db.banners.find_one({"id": bid}))


@api_router.delete("/admin/media/{bid}")
async def delete_banner(bid: str, user=Depends(get_current_user)):
    res = await db.banners.delete_one({"id": bid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    return {"message": "deleted"}


# ---------------- Public storefront ----------------

@api_router.get("/store/products")
async def store_products():
    return [clean(p) for p in await db.products.find({"status": "published"}).sort("created_at", -1).to_list(200)]


@api_router.get("/store/banner")
async def store_banner():
    banner = await db.banners.find_one({"active": True}, {"_id": 0})
    if not banner:
        banner = await db.banners.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    return banner or {}


@api_router.get("/")
async def root():
    return {"message": "AuraMart Luxe API"}


# ---------------- Seeding ----------------

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Store Owner", "role": "admin", "token_version": 0,
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin account: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def seed_catalog():
    if await db.products.count_documents({}) == 0:
        products = [
            {
                "id": str(uuid.uuid4()), "title": "Aura Royal Chronograph 24K",
                "description": "A masterpiece of horology. The Aura Royal Chronograph pairs a 24K gold-plated bezel with precision quartz movement, resting on obsidian-black Italian leather.\n\nEvery glance at your wrist becomes a statement of quiet power and timeless taste.",
                "category": "Horology & Timepieces", "price": 890, "wholesale_price": 240,
                "seo_tags": ["luxury watch", "gold chronograph", "men's luxury watch", "24k gold watch", "premium timepiece", "designer watch", "aura royal", "gift for him"],
                "selling_points": ["24K gold-plated bezel", "Precision quartz movement", "Italian leather strap", "Signature gift coffret included"],
                "image_url": "https://images.unsplash.com/photo-1772949400107-f35fd026ab77?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjB3YXRjaCUyMGdvbGQlMjBqZXdlbHJ5JTIwZGFyayUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzg1NDc5Mzc5fDA&ixlib=rb-4.1.0&q=85",
                "source_link": "", "status": "published", "created_at": now_iso(),
            },
            {
                "id": str(uuid.uuid4()), "title": "Elixir D'Or Parfum Signature",
                "description": "An intoxicating blend of rare oud, amber and golden saffron. Elixir D'Or is bottled opulence — a fragrance that announces you before you speak.\n\nHand-poured in small batches, sealed in a gilded flacon worthy of your vanity.",
                "category": "Haute Parfumerie", "price": 280, "wholesale_price": 65,
                "seo_tags": ["luxury perfume", "oud fragrance", "gold perfume", "niche parfum", "signature scent", "elixir d'or", "premium fragrance", "unisex perfume"],
                "selling_points": ["Rare oud & golden saffron", "12-hour longevity", "Hand-poured small batches", "Gilded collectible flacon"],
                "image_url": "https://images.pexels.com/photos/29986521/pexels-photo-29986521.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
                "source_link": "", "status": "published", "created_at": now_iso(),
            },
            {
                "id": str(uuid.uuid4()), "title": "Kintsugi Gold Leather Clutch",
                "description": "Inspired by the Japanese art of golden repair, this clutch traces veins of gold across midnight-black full-grain leather.\n\nA wearable sculpture — equal parts evening armour and objet d'art.",
                "category": "Leather Goods", "price": 450, "wholesale_price": 120,
                "seo_tags": ["luxury clutch", "gold leather bag", "evening clutch", "kintsugi bag", "designer handbag", "black gold purse", "statement clutch", "luxury gift"],
                "selling_points": ["Full-grain Italian leather", "Hand-painted gold veining", "Suede interior & gold hardware", "Detachable gold chain strap"],
                "image_url": "https://images.unsplash.com/photo-1779878603885-f211807da45e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwyfHxsdXh1cnklMjBsZWF0aGVyJTIwaGFuZGJhZyUyMGRhcmslMjBiYWNrZ3JvdW5kJTIwZ29sZCUyMGFjY2VudHxlbnwwfHx8fDE3ODYwODI1OTl8MA&ixlib=rb-4.1.0&q=85",
                "source_link": "", "status": "published", "created_at": now_iso(),
            },
        ]
        await db.products.insert_many(products)
        logger.info("Seeded catalog products")

    if await db.banners.count_documents({}) == 0:
        await db.banners.insert_one({
            "id": str(uuid.uuid4()), "type": "image",
            "prompt": "Rose gold luxury watch on obsidian fabric",
            "image_url": "https://images.unsplash.com/photo-1772949399823-dcd1678fcce7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHszfHxsdXh1cnklMjB3YXRjaCUyMGdvbGQlMjBqZXdlbHJ5JTIwZGFyayUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzg1NDc5Mzc5fDA&ixlib=rb-4.1.0&q=85",
            "video_url": None, "active": True, "status": "ready", "created_at": now_iso(),
        })

    if await db.orders.count_documents({}) == 0:
        products = await db.products.find({}, {"_id": 0}).to_list(10)
        if products:
            sample = [
                {"name": "Aarav Mehta", "phone": "+91 98200 44521", "address": "1402, Marine Crest Towers, Netaji Subhash Marg", "city": "Mumbai", "state": "Maharashtra", "pincode": "400020"},
                {"name": "Ishita Kapoor", "phone": "+91 99530 88712", "address": "B-77, Defence Colony, Ring Road", "city": "New Delhi", "state": "Delhi", "pincode": "110024"},
                {"name": "Rohan Nair", "phone": "+91 90080 33214", "address": "9, Palm Grove Villas, 100 Ft Road, Indiranagar", "city": "Bengaluru", "state": "Karnataka", "pincode": "560038"},
            ]
            statuses = ["pending", "confirmed", "delivered"]
            for i, cust in enumerate(sample):
                p = products[i % len(products)]
                oid = str(uuid.uuid4())
                await db.orders.insert_one({
                    "id": oid, "order_no": f"AML-{oid[:8].upper()}", "customer": cust,
                    "items": [{"product_id": p["id"], "title": p["title"], "price": p["price"], "qty": 1, "image_url": p["image_url"]}],
                    "total": p["price"], "status": statuses[i], "fulfillment": None, "created_at": now_iso(),
                })
            logger.info("Seeded sample orders")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await seed_admin()
    await seed_catalog()


app.include_router(api_router)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
