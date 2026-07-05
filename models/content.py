from datetime import datetime

from pydantic import BaseModel


class Metric(BaseModel):
    label: str
    value: str


class Pillar(BaseModel):
    title: str
    description: str


class Product(BaseModel):
    name: str
    subtitle: str


class Sector(BaseModel):
    title: str
    description: str


class Insight(BaseModel):
    title: str


class CaseStudy(BaseModel):
    title: str
    description: str
    media: str
    overlay: str


class Publication(BaseModel):
    id: int
    title: str
    summary: str
    category: str
    author_name: str
    contact_email: str
    status: str
    published_at: datetime | None
    tags: list[str]


class EmailAccount(BaseModel):
    id: int
    display_name: str
    email: str
    area: str
    is_primary: bool


class ContactMessage(BaseModel):
    id: int
    full_name: str
    email: str
    organization: str
    topic: str
    area: str
    assigned_email: str
    message: str
    source_page: str
    status: str
    created_at: datetime


class HomeContent(BaseModel):
    slogan: str
    mission: str
    vision: str
    metrics: list[Metric]
    pillars: list[Pillar]
    products: list[Product]
    sectors: list[Sector]
    observatory: list[Metric]
    insights: list[Insight]
    case_studies: list[CaseStudy]
    publications: list[Publication]
