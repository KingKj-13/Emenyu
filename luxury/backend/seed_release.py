import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.config import get_settings
from app.models.luxury import AppRelease

async def seed():
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if version 2 is already registered
        result = await session.execute(
            select(AppRelease).where(AppRelease.appType == "customer_tablet", AppRelease.versionCode == 2)
        )
        existing = result.scalar_one_or_none()

        if existing:
            print("Release version 2 is already registered in the database.")
            return

        # Insert new release record (Version 2)
        new_release = AppRelease(
            appType="customer_tablet",
            versionCode=2,
            versionName="1.1.0",
            apkUrl="http://127.0.0.1:8000/static/releases/app-release-v1.1.0.apk",
            releaseNotes="Premium menu content and 28 items integration. Force update required.",
            minVersionCode=1,
            active=True
        )

        session.add(new_release)
        await session.commit()
        print("Successfully registered critical release Version 2 in the database!")

if __name__ == "__main__":
    asyncio.run(seed())
