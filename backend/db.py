"""MongoDB client and the shared API router."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
api_router = APIRouter(prefix="/api")
