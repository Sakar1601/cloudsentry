import os

import pytest

# Must be set before any test module imports app.main, since action_store
# is constructed at module import time — ensures the test suite never
# writes into the real cloudsentry_actions.db file a live dev server
# might be reading from in the same working directory.
os.environ.setdefault("CLOUDSENTRY_ACTIONS_DB", ":memory:")


@pytest.fixture
def anyio_backend():
    return "asyncio"
