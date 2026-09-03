"""AuraMart Luxe backend API tests (auth, products, orders, media, storefront)."""
import os
import re
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    c = p.read_text()
    e = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    pw = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    if not e or not pw:
        pytest.skip("no creds parsed")
    return {"email": e.group(1), "password": pw.group(1)}


@pytest.fixture(scope="session")
def admin(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return s


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success_sets_httponly_cookies(self, creds):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json=creds, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == creds["email"]
        assert data["role"] == "admin"
        assert "password" not in str(data).lower()
        raw = r.headers.get("set-cookie", "")
        assert "access_token" in raw and "refresh_token" in raw
        assert raw.lower().count("httponly") >= 2
        assert "secure" in raw.lower()

    def test_me_authenticated(self, admin, creds):
        r = admin.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == creds["email"]

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_refresh(self, admin):
        r = admin.post(f"{API}/auth/refresh", timeout=30)
        assert r.status_code == 200
        assert "access_token" in r.headers.get("set-cookie", "")

    def test_wrong_password_401(self, creds):
        r = requests.post(f"{API}/auth/login", json={"email": creds["email"], "password": "WrongPass!123"}, timeout=30)
        assert r.status_code == 401
        assert "Invalid" in r.json()["detail"]

    def test_logout_clears_cookies(self, creds):
        s = requests.Session()
        s.post(f"{API}/auth/login", json=creds, timeout=30)
        r = s.post(f"{API}/auth/logout", timeout=30)
        assert r.status_code == 200
        assert s.get(f"{API}/auth/me", timeout=30).status_code == 401

    def test_cors_allows_credentials(self):
        # Preflight at the public edge is answered by the ingress proxy (ACAO: *),
        # so assert the FastAPI CORS policy directly on the app port.
        r = requests.options("http://localhost:8001/api/auth/login", headers={
            "Origin": BASE_URL, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"}, timeout=30)
        assert r.status_code in (200, 204)
        assert r.headers.get("access-control-allow-credentials") == "true"
        assert r.headers.get("access-control-allow-origin") == BASE_URL


# ---------------- Route protection ----------------
class TestRouteProtection:
    @pytest.mark.parametrize("path", ["/admin/orders", "/admin/products", "/admin/stats", "/admin/media"])
    def test_get_requires_auth(self, path):
        assert requests.get(f"{API}{path}", timeout=30).status_code == 401

    @pytest.mark.parametrize("path", ["/admin/products", "/admin/ai/generate-product",
                                      "/admin/media/generate-banner", "/admin/media/generate-video"])
    def test_post_requires_auth(self, path):
        assert requests.post(f"{API}{path}", json={}, timeout=30).status_code == 401

    def test_invalid_token_rejected(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus.token.value"}, timeout=30)
        assert r.status_code == 401


# ---------------- Password reset ----------------
class TestPasswordReset:
    def test_forgot_password_generic_for_registered_and_unregistered(self, creds):
        r1 = requests.post(f"{API}/auth/forgot-password", json={"email": creds["email"]}, timeout=30)
        r2 = requests.post(f"{API}/auth/forgot-password", json={"email": f"nobody-{uuid.uuid4().hex}@x.com"}, timeout=30)
        assert r1.status_code == r2.status_code == 200
        assert r1.json() == r2.json()
        assert "reset link has been sent" in r1.json()["message"]

    def test_reset_with_invalid_token_400(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "nope", "password": "Xyz!23456"}, timeout=30)
        assert r.status_code == 400


# ---------------- Products CRUD ----------------
class TestProducts:
    created = []

    def test_crud_and_persistence(self, admin):
        payload = {"title": "TEST_Gilded Test Product", "description": "Test desc",
                   "category": "Fine Jewellery", "price": 1200, "wholesale_price": 300,
                   "seo_tags": ["a", "b"], "selling_points": ["x"], "image_url": "",
                   "source_link": "", "status": "draft"}
        r = admin.post(f"{API}/admin/products", json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        p = r.json()
        assert "_id" not in p and isinstance(p["id"], str)
        assert p["title"] == payload["title"] and p["price"] == 1200
        TestProducts.created.append(p["id"])

        lst = admin.get(f"{API}/admin/products", timeout=30)
        assert lst.status_code == 200
        assert any(x["id"] == p["id"] for x in lst.json())

        # draft not on storefront
        store = requests.get(f"{API}/store/products", timeout=30).json()
        assert all(x["id"] != p["id"] for x in store)

        # publish
        payload["status"] = "published"
        payload["title"] = "TEST_Gilded Published"
        up = admin.put(f"{API}/admin/products/{p['id']}", json=payload, timeout=30)
        assert up.status_code == 200
        assert up.json()["status"] == "published"
        assert up.json()["title"] == "TEST_Gilded Published"

        store = requests.get(f"{API}/store/products", timeout=30).json()
        match = [x for x in store if x["id"] == p["id"]]
        assert match and match[0]["title"] == "TEST_Gilded Published"

        # delete
        d = admin.delete(f"{API}/admin/products/{p['id']}", timeout=30)
        assert d.status_code == 200
        assert all(x["id"] != p["id"] for x in admin.get(f"{API}/admin/products", timeout=30).json())
        TestProducts.created.remove(p["id"])

    def test_update_missing_product_404(self, admin):
        r = admin.put(f"{API}/admin/products/{uuid.uuid4()}", json={"title": "x"}, timeout=30)
        assert r.status_code == 404

    def test_delete_missing_product_404(self, admin):
        assert admin.delete(f"{API}/admin/products/{uuid.uuid4()}", timeout=30).status_code == 404

    def test_create_validation_error(self, admin):
        assert admin.post(f"{API}/admin/products", json={"description": "no title"}, timeout=30).status_code == 422

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, admin):
        yield
        for pid in list(TestProducts.created):
            admin.delete(f"{API}/admin/products/{pid}", timeout=30)


# ---------------- Orders ----------------
class TestOrders:
    order_ids = []

    def _create_order(self, admin=None):
        store = requests.get(f"{API}/store/products", timeout=30).json()
        assert store, "no published products for order test"
        pid = store[0]["id"]
        body = {"customer": {"name": "TEST_Customer", "phone": "+91 90000 00001",
                             "address": "12 Test Lane", "city": "Mumbai",
                             "state": "Maharashtra", "pincode": "400001"},
                "items": [{"product_id": pid, "qty": 2}]}
        r = requests.post(f"{API}/orders", json=body, timeout=30)
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        TestOrders.order_ids.append(o["id"])
        return o, store[0]

    def test_public_order_creation_and_totals(self):
        o, p = self._create_order()
        assert "_id" not in o
        assert o["order_no"].startswith("AML-")
        assert o["status"] == "pending"
        assert o["total"] == round(p["price"] * 2, 2)
        assert o["items"][0]["title"] == p["title"]
        assert o["customer"]["city"] == "Mumbai"

    def test_order_appears_in_admin_list(self, admin):
        o, _ = self._create_order()
        r = admin.get(f"{API}/admin/orders", timeout=30)
        assert r.status_code == 200
        found = [x for x in r.json() if x["id"] == o["id"]]
        assert found and found[0]["customer"]["name"] == "TEST_Customer"

    def test_order_invalid_product_404(self):
        body = {"customer": {"name": "TEST_x", "phone": "1", "address": "a", "city": "b",
                             "state": "c", "pincode": "1"},
                "items": [{"product_id": str(uuid.uuid4()), "qty": 1}]}
        assert requests.post(f"{API}/orders", json=body, timeout=30).status_code == 404

    def test_status_update_persists(self, admin):
        o, _ = self._create_order()
        for st in ["confirmed", "delivered", "cancelled"]:
            r = admin.patch(f"{API}/admin/orders/{o['id']}/status", json={"status": st}, timeout=30)
            assert r.status_code == 200
            assert r.json()["status"] == st
            got = [x for x in admin.get(f"{API}/admin/orders", timeout=30).json() if x["id"] == o["id"]][0]
            assert got["status"] == st

    def test_status_invalid_400(self, admin):
        o, _ = self._create_order()
        assert admin.patch(f"{API}/admin/orders/{o['id']}/status", json={"status": "teleported"}, timeout=30).status_code == 400

    def test_status_missing_order_404(self, admin):
        assert admin.patch(f"{API}/admin/orders/{uuid.uuid4()}/status", json={"status": "confirmed"}, timeout=30).status_code == 404

    def test_fulfillment_sets_awb_and_dispatched(self, admin):
        o, _ = self._create_order()
        r = admin.post(f"{API}/admin/orders/{o['id']}/fulfill", json={"provider": "delhivery"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["fulfillment"]["provider"] == "delhivery"
        assert d["fulfillment"]["awb"].startswith("AUR")
        assert d["payload"]["order_id"] == o["order_no"]
        got = [x for x in admin.get(f"{API}/admin/orders", timeout=30).json() if x["id"] == o["id"]][0]
        assert got["status"] == "dispatched"
        assert got["fulfillment"]["awb"] == d["fulfillment"]["awb"]

    def test_fulfill_bad_provider_400(self, admin):
        o, _ = self._create_order()
        assert admin.post(f"{API}/admin/orders/{o['id']}/fulfill", json={"provider": "pigeon"}, timeout=30).status_code == 400

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self):
        yield
        # No delete-order endpoint exists; test orders are prefixed TEST_Customer
        pass


# ---------------- Stats ----------------
class TestStats:
    def test_stats_shape(self, admin):
        r = admin.get(f"{API}/admin/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["revenue", "orders_total", "by_status", "products_live", "products_total", "recent_orders"]:
            assert k in d
        assert isinstance(d["orders_total"], int) and d["orders_total"] >= 0
        assert set(["pending", "confirmed", "dispatched", "delivered", "cancelled"]).issubset(d["by_status"].keys())
        assert len(d["recent_orders"]) <= 5
        assert all("_id" not in o for o in d["recent_orders"])


# ---------------- Storefront ----------------
class TestStorefront:
    def test_store_products_published_only(self):
        r = requests.get(f"{API}/store/products", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and items
        assert all(p["status"] == "published" for p in items)
        assert all("_id" not in p for p in items)

    def test_store_banner(self):
        r = requests.get(f"{API}/store/banner", timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert "image_url" in b and b["image_url"]
        assert "_id" not in b


# ---------------- Media ----------------
class TestMedia:
    def test_list_media(self, admin):
        r = admin.get(f"{API}/admin/media", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_activate_banner_exclusive(self, admin):
        banners = admin.get(f"{API}/admin/media", timeout=30).json()
        if not banners:
            pytest.skip("no banners")
        bid = banners[0]["id"]
        r = admin.post(f"{API}/admin/media/{bid}/activate", timeout=30)
        assert r.status_code == 200
        assert r.json()["active"] is True
        all_b = admin.get(f"{API}/admin/media", timeout=30).json()
        assert sum(1 for b in all_b if b["active"]) == 1
        assert requests.get(f"{API}/store/banner", timeout=30).json()["id"] == bid

    def test_activate_missing_404(self, admin):
        assert admin.post(f"{API}/admin/media/{uuid.uuid4()}/activate", timeout=30).status_code == 404

    def test_delete_missing_404(self, admin):
        assert admin.delete(f"{API}/admin/media/{uuid.uuid4()}", timeout=30).status_code == 404


# ---------------- AI (real LLM calls, slow) ----------------
class TestAI:
    def test_generate_product_content(self, admin):
        t0 = time.time()
        r = admin.post(f"{API}/admin/ai/generate-product",
                       json={"input_text": "Rose gold women wrist watch meesho", "wholesale_price": 300},
                       timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        d = r.json()
        for k in ["marketing_title", "description", "selling_points", "seo_tags", "category",
                  "suggested_price", "estimated_wholesale", "margin_note"]:
            assert k in d, f"missing {k} in {d}"
        assert len(d["marketing_title"]) > 5
        assert len(d["seo_tags"]) >= 4
        assert float(d["suggested_price"]) > 300
        print(f"AI product gen took {time.time()-t0:.1f}s")

    def test_generate_banner_image(self, admin):
        t0 = time.time()
        r = admin.post(f"{API}/admin/media/generate-banner",
                       json={"prompt": "TEST_ rose gold watch on obsidian silk"}, timeout=240)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        d = r.json()
        assert d["image_url"].startswith("/api/uploads/")
        assert d["type"] == "image" and d["active"] is False
        img = requests.get(f"{BASE_URL}{d['image_url']}", timeout=60)
        assert img.status_code == 200 and len(img.content) > 5000
        print(f"AI banner gen took {time.time()-t0:.1f}s")
        admin.delete(f"{API}/admin/media/{d['id']}", timeout=30)
