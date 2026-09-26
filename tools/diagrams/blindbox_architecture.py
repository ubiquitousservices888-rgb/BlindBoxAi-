#!/usr/bin/env python3
"""Generate the BlindBoxAI architecture diagram.

Documentation tooling only:
- no network calls
- no credentials
- no production writes
- output stays inside docs/architecture
"""

from __future__ import annotations

from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.generic.database import SQL
from diagrams.generic.device import Mobile
from diagrams.generic.storage import Storage
from diagrams.onprem.vcs import Github
from diagrams.programming.flowchart import Action, Display, Inspection
from diagrams.programming.framework import Nextjs, Vercel
from diagrams.programming.language import Nodejs, Python
from diagrams.saas.chat import Discord


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "docs" / "architecture"
OUTPUT_BASENAME = OUTPUT_DIR / "blindbox-system"


def build_diagram() -> Path:
    """Render the documented BlindBoxAI system map as SVG."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    graph_attr = {
        "pad": "0.4",
        "nodesep": "0.45",
        "ranksep": "0.7",
        "splines": "spline",
        "fontsize": "18",
    }
    node_attr = {
        "fontsize": "11",
    }
    edge_attr = {
        "fontsize": "9",
    }

    with Diagram(
        "BlindBoxAI System Architecture",
        filename=str(OUTPUT_BASENAME),
        outformat="svg",
        show=False,
        direction="LR",
        graph_attr=graph_attr,
        node_attr=node_attr,
        edge_attr=edge_attr,
    ):
        visitor = Mobile("Collector / Owner")

        with Cluster("Source & Deployment"):
            github = Github("GitHub")
            vercel = Vercel("Vercel")
            app = Nextjs("Next.js app + API")
            github >> Edge(label="deploy") >> vercel >> app

        with Cluster("Research & Data"):
            know_it_all = Nodejs("Mr. Know It All")
            supabase = SQL("Supabase data")
            media = Storage("Supabase media")
            app >> Edge(label="research") >> know_it_all >> supabase
            app >> Edge(label="read/write") >> supabase

        with Cluster("Owner-Gated Content Pipeline"):
            video = Nodejs("Video pipeline")
            render = Action("Creatomate render")
            review = Inspection("Owner approval")
            publisher = Action("Buffer publisher")
            channels = Display("YouTube / TikTok / X / Facebook")

            supabase >> Edge(label="review queue") >> video
            video >> render >> review
            render >> Edge(label="media") >> media
            review >> Edge(label="approved only") >> publisher >> channels

        with Cluster("Affiliate Monetization"):
            ebay = Display("eBay / EPN outbound")
            app >> Edge(label="tracked outbound") >> ebay

        with Cluster("Operations"):
            alerts = Discord("Discord alerts")
            video >> Edge(style="dashed", label="failures") >> alerts
            publisher >> Edge(style="dashed", label="failures") >> alerts

        with Cluster("Documentation Tooling — non-runtime"):
            diagrams_tool = Python("Diagrams generator")
            diagrams_tool >> Edge(style="dashed", label="versioned docs") >> github

        visitor >> Edge(label="HTTPS") >> app

    return OUTPUT_BASENAME.with_suffix(".svg")


if __name__ == "__main__":
    output = build_diagram()
    print(f"Generated {output.relative_to(ROOT)}")
