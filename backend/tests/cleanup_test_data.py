"""Cleanup helper: removes QA-created orders/products/banners (prefix TEST_)."""
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
o = db.orders.delete_many({"customer.name": {"$regex": "^TEST_"}})
p = db.products.delete_many({"title": {"$regex": "^TEST_"}})
b = db.banners.delete_many({"prompt": {"$regex": "TEST_"}})
print("deleted orders", o.deleted_count, "products", p.deleted_count, "banners", b.deleted_count)
print("remaining orders", db.orders.count_documents({}), "products", db.products.count_documents({}),
      "banners", db.banners.count_documents({}), "active banners", db.banners.count_documents({"active": True}))
