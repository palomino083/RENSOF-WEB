"""Publication metadata

Revision ID: 0002_publication_metadata
Revises: 0001_initial_schema
Create Date: 2026-07-01 00:30:00

"""

from alembic import op
import sqlalchemy as sa


revision = "0002_publication_metadata"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("publications", sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"))
    op.add_column("publications", sa.Column("published_at", sa.DateTime(), nullable=True))
    op.add_column("publications", sa.Column("tags", sa.String(length=240), nullable=False, server_default=""))

    op.execute("UPDATE publications SET status = 'published' WHERE status IS NULL OR status = ''")


def downgrade() -> None:
    op.drop_column("publications", "tags")
    op.drop_column("publications", "published_at")
    op.drop_column("publications", "status")
