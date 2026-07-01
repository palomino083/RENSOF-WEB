"""Email accounts primary and contact inbox

Revision ID: 0003_email_accounts_and_inbox
Revises: 0002_publication_metadata
Create Date: 2026-07-01 02:10:00

"""

from alembic import op
import sqlalchemy as sa


revision = "0003_email_accounts_and_inbox"
down_revision = "0002_publication_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_accounts", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        """
        UPDATE email_accounts
        SET is_primary = 1
        WHERE id = (
            SELECT id FROM email_accounts ORDER BY id LIMIT 1
        )
        """
    )

    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("full_name", sa.String(length=140), nullable=False),
        sa.Column("email", sa.String(length=180), nullable=False),
        sa.Column("organization", sa.String(length=140), nullable=False, server_default=""),
        sa.Column("topic", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("area", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("assigned_email", sa.String(length=180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("source_page", sa.String(length=40), nullable=False, server_default="contacto"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("contact_messages")
    op.drop_column("email_accounts", "is_primary")
