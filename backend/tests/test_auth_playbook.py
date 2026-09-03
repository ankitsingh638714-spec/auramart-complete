"""Auth playbook checks: bcrypt format, indexes, brute-force lockout (uses a throwaway email)."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
backend_env = dotenv_values("/app/backend/.env")


@pytest.fixture(scope="module")
def mongo_db():
    cl = MongoClient(backend_env["MONGO_URL"])
    yield cl[backend_env["DB_NAME"]]
    cl.close()


def test_admin_hash_and_indexes(mongo_db):
    admin = mongo_db.users.find_one({"role": "admin"})
    assert admin, "no admin user seeded"
    assert admin["password_hash"].startswith("$2b$"), admin["password_hash"][:10]
    assert "password" not in admin
    assert any(i.get("unique") and i["key"][0][0] == "email" for i in mongo_db.users.index_information().values())
    assert any(i.get("unique") and i["key"][0][0] == "token_hash"
               for i in mongo_db.password_reset_tokens.index_information().values())
    keys = [i["key"][0][0] for i in mongo_db.login_attempts.index_information().values()]
    assert "identifier" in keys and "email" in keys
    tok = mongo_db.password_reset_tokens.find_one({}, sort=[("expires_at", -1)])
    if tok:
        assert len(tok["token_hash"]) == 64 and "token" not in tok


def test_brute_force_lockout_public_url(mongo_db):
    email = f"lockout-{uuid.uuid4().hex}@example.com"
    codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "bad"}, timeout=30).status_code
             for _ in range(7)]
    identifiers = mongo_db.login_attempts.distinct("identifier", {"email": email})
    print(f"codes={codes} distinct_identifiers={identifiers}")
    assert codes[:5] == [401] * 5, codes
    assert 429 in codes[5:], f"no lockout via public URL; codes={codes} identifiers={identifiers}"


def test_brute_force_lockout_localhost():
    email = f"lockout-local-{uuid.uuid4().hex}@example.com"
    codes = [requests.post("http://localhost:8001/api/auth/login",
                           json={"email": email, "password": "bad"}, timeout=30).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5, codes
    assert 429 in codes[5:], codes
