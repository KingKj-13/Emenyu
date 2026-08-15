"""Tests for the Media Pipeline."""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.orchestrator.media_pipeline import MediaPipeline
from app.schemas.dining import DiningState


class TestMediaPipeline:
    """Media asset management tests."""

    def test_resolve_url(self):
        pipeline = MediaPipeline()
        url = pipeline.resolve_url("hero/tomahawk.jpg", version=3)
        assert "hero/tomahawk.jpg" in url
        assert "v=3" in url

    def test_resolve_url_empty_path(self):
        pipeline = MediaPipeline()
        assert pipeline.resolve_url("") == ""

    def test_resolve_url_strips_leading_slash(self):
        pipeline = MediaPipeline()
        url = pipeline.resolve_url("/hero/tomahawk.jpg", version=1)
        assert "//hero" not in url

    def test_file_exists_missing(self):
        pipeline = MediaPipeline()
        assert not pipeline.file_exists("nonexistent/file.jpg")

    def test_file_size_missing(self):
        pipeline = MediaPipeline()
        assert pipeline.file_size("nonexistent/file.jpg") == 0

    def test_preload_order_empty(self):
        pipeline = MediaPipeline()
        order = pipeline.get_preload_order(DiningState.STARTERS, items=[])
        assert order == []

    def test_preload_order_prioritizes_chef_picks(self):
        pipeline = MediaPipeline()
        items = [
            {"name": "Regular", "hero_image_path": "hero/regular.jpg", "chef_pick": False, "popular": False},
            {"name": "Chef Pick", "hero_image_path": "hero/chef.jpg", "chef_pick": True, "popular": False},
            {"name": "Popular", "hero_image_path": "hero/popular.jpg", "chef_pick": False, "popular": True},
        ]
        order = pipeline.get_preload_order(DiningState.MAINS, items)
        assert order[0] == "hero/chef.jpg"

    def test_preload_images_before_videos(self):
        pipeline = MediaPipeline()
        items = [
            {
                "name": "Item",
                "hero_image_path": "hero/item.jpg",
                "hero_video_path": "video/item.mp4",
                "chef_pick": True,
                "popular": True,
            },
        ]
        order = pipeline.get_preload_order(DiningState.MAINS, items)
        assert order.index("hero/item.jpg") < order.index("video/item.mp4")

    def test_ensure_directories(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pipeline = MediaPipeline()
            pipeline._root = Path(tmpdir)  # Override for test
            pipeline.ensure_directories()
            assert (Path(tmpdir) / "hero").is_dir()
            assert (Path(tmpdir) / "video").is_dir()
            assert (Path(tmpdir) / "category").is_dir()
            assert (Path(tmpdir) / "chef").is_dir()
