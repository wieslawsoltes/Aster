/* Reviewed public web-app catalog. No network discovery or preloading at startup. MIT. */
'use strict';
(() => {
    const data = {
  "version": 1,
  "owner": "wieslawsoltes",
  "timezone": "Europe/Warsaw",
  "startInclusive": "2026-09-06T00:00:00+02:00",
  "endExclusive": "2026-09-09T00:00:00+02:00",
  "auditedAt": "2026-09-08T06:59:01.286171+00:00",
  "categories": [
    {
      "id": "design",
      "title": "Design & Graphics",
      "icon": "paint",
      "color": "violet"
    },
    {
      "id": "animation",
      "title": "3D & Animation",
      "icon": "gpu",
      "color": "teal"
    },
    {
      "id": "cad",
      "title": "CAD & Manufacturing",
      "icon": "rect",
      "color": "blue"
    },
    {
      "id": "simulation",
      "title": "Science & Simulation",
      "icon": "spark",
      "color": "teal"
    },
    {
      "id": "industrial",
      "title": "Process & Automation",
      "icon": "settings",
      "color": "slate"
    },
    {
      "id": "buildings",
      "title": "Buildings & Maps",
      "icon": "globe",
      "color": "green"
    },
    {
      "id": "office",
      "title": "Office & Productivity",
      "icon": "file",
      "color": "blue"
    },
    {
      "id": "development",
      "title": "Development & Data",
      "icon": "code",
      "color": "violet"
    },
    {
      "id": "media",
      "title": "Audio & Video",
      "icon": "video",
      "color": "coral"
    },
    {
      "id": "games",
      "title": "Games",
      "icon": "play",
      "color": "green"
    }
  ],
  "apps": [
    {
      "repo": "Vellum",
      "title": "Vellum",
      "description": "Collaborative-style interface and vector design",
      "category": "design",
      "createdAt": "2026-09-05T22:07:12Z",
      "url": "https://wieslawsoltes.github.io/Vellum/",
      "documentTitle": "Vellum — a little more possible."
    },
    {
      "repo": "Forma",
      "title": "Forma",
      "description": "Vector and user-interface design studio",
      "category": "design",
      "createdAt": "2026-09-06T10:15:42Z",
      "url": "https://wieslawsoltes.github.io/Forma/",
      "documentTitle": "Forma — A little more possible."
    },
    {
      "repo": "Vectora",
      "title": "Vectora",
      "description": "Vector illustration and artwork",
      "category": "design",
      "createdAt": "2026-09-07T13:44:07Z",
      "url": "https://wieslawsoltes.github.io/Vectora/",
      "documentTitle": "Vectora — Vector Design Studio"
    },
    {
      "repo": "LumaForge",
      "title": "LumaForge",
      "description": "Photo editing and image development",
      "category": "design",
      "createdAt": "2026-09-07T13:47:03Z",
      "url": "https://wieslawsoltes.github.io/LumaForge/",
      "documentTitle": "LumaForge — Photo Studio"
    },
    {
      "repo": "PrismForge",
      "title": "PrismForge",
      "description": "Layered raster graphics and photo editing",
      "category": "design",
      "createdAt": "2026-09-07T13:47:44Z",
      "url": "https://wieslawsoltes.github.io/PrismForge/",
      "documentTitle": "PrismForge — Image Studio"
    },
    {
      "repo": "PrismStudio",
      "title": "PrismStudio",
      "description": "Interactive interface design workbench",
      "category": "design",
      "createdAt": "2026-09-07T13:56:47Z",
      "url": "https://wieslawsoltes.github.io/PrismStudio/",
      "documentTitle": "Prism Studio — Visual interface design"
    },
    {
      "repo": "PaintXP",
      "title": "PaintXP",
      "description": "Classic paint tools and pixel graphics",
      "category": "design",
      "createdAt": "2026-09-07T21:21:02Z",
      "url": "https://wieslawsoltes.github.io/PaintXP/",
      "documentTitle": "untitled - Paint"
    },
    {
      "repo": "SELVEDGEStudio",
      "title": "SELVEDGEStudio",
      "description": "Garment patterns and cloth design",
      "category": "design",
      "createdAt": "2026-09-07T14:07:02Z",
      "url": "https://wieslawsoltes.github.io/SELVEDGEStudio/",
      "documentTitle": "SELVEDGE Studio — Garment workspace"
    },
    {
      "repo": "AetherMotion",
      "title": "AetherMotion",
      "description": "Motion graphics and compositing",
      "category": "animation",
      "createdAt": "2026-09-07T10:43:06Z",
      "url": "https://wieslawsoltes.github.io/AetherMotion/",
      "documentTitle": "Aether Motion — Motion, without limits."
    },
    {
      "repo": "CelestaStudio",
      "title": "CelestaStudio",
      "description": "Vector animation and timelines",
      "category": "animation",
      "createdAt": "2026-09-06T19:54:48Z",
      "url": "https://wieslawsoltes.github.io/CelestaStudio/",
      "documentTitle": "Celesta — Animation, with a little wonder."
    },
    {
      "repo": "KinetraStudio",
      "title": "KinetraStudio",
      "description": "3D modeling and animation",
      "category": "animation",
      "createdAt": "2026-09-07T10:17:24Z",
      "url": "https://wieslawsoltes.github.io/KinetraStudio/",
      "documentTitle": "Kinetra Studio — 3D creation, in motion"
    },
    {
      "repo": "LithicSculpt",
      "title": "LithicSculpt",
      "description": "Digital sculpting",
      "category": "animation",
      "createdAt": "2026-09-06T20:44:42Z",
      "url": "https://wieslawsoltes.github.io/LithicSculpt/",
      "documentTitle": "Lithic Sculpt — Digital sculpting studio"
    },
    {
      "repo": "VertexForge",
      "title": "VertexForge",
      "description": "Polygon modeling and 3D animation",
      "category": "animation",
      "createdAt": "2026-09-07T10:19:20Z",
      "url": "https://wieslawsoltes.github.io/VertexForge/",
      "documentTitle": "Vertex Forge — 3D Studio"
    },
    {
      "repo": "VortexFX",
      "title": "VortexFX",
      "description": "Procedural 3D effects",
      "category": "animation",
      "createdAt": "2026-09-06T21:19:15Z",
      "url": "https://wieslawsoltes.github.io/VortexFX/",
      "documentTitle": "Vortex FX — Procedural 3D"
    },
    {
      "repo": "StrataForge",
      "title": "StrataForge",
      "description": "Materials and procedural textures",
      "category": "animation",
      "createdAt": "2026-09-06T21:17:04Z",
      "url": "https://wieslawsoltes.github.io/StrataForge/",
      "documentTitle": "StrataForge — Material Studio"
    },
    {
      "repo": "AlloyStudio",
      "title": "AlloyStudio",
      "description": "Integrated CAD design studio",
      "category": "cad",
      "createdAt": "2026-09-07T10:16:05Z",
      "url": "https://wieslawsoltes.github.io/AlloyStudio/",
      "documentTitle": "Alloy Studio — Orbital bearing mount"
    },
    {
      "repo": "AureonCAD",
      "title": "AureonCAD",
      "description": "Parametric 3D CAD workbench",
      "category": "cad",
      "createdAt": "2026-09-06T21:17:26Z",
      "url": "https://wieslawsoltes.github.io/AureonCAD/",
      "documentTitle": "Aureon CAD — Precision, by design."
    },
    {
      "repo": "AxiomCAD",
      "title": "AxiomCAD",
      "description": "Mechanical CAD modeling",
      "category": "cad",
      "createdAt": "2026-09-06T10:17:18Z",
      "url": "https://wieslawsoltes.github.io/AxiomCAD/",
      "documentTitle": "Axiom CAD · Mechanical design, reimagined"
    },
    {
      "repo": "AxiomCAM",
      "title": "AxiomCAM",
      "description": "CAD and 2.5D machining",
      "category": "cad",
      "createdAt": "2026-09-06T20:55:16Z",
      "url": "https://wieslawsoltes.github.io/AxiomCAM/",
      "documentTitle": "AxiomCAM · Precision in every path"
    },
    {
      "repo": "Draftline",
      "title": "Draftline",
      "description": "Precision 2D drafting",
      "category": "cad",
      "createdAt": "2026-09-06T07:31:17Z",
      "url": "https://wieslawsoltes.github.io/Draftline/",
      "documentTitle": "Draftline — Precision, without limits."
    },
    {
      "repo": "KestrelCAD",
      "title": "KestrelCAD",
      "description": "2D and 3D CAD with DXF workflows",
      "category": "cad",
      "createdAt": "2026-09-07T07:39:19Z",
      "url": "https://wieslawsoltes.github.io/KestrelCAD/",
      "documentTitle": "Kestrel CAD"
    },
    {
      "repo": "StratumCAD",
      "title": "StratumCAD",
      "description": "Precision engineering CAD",
      "category": "cad",
      "createdAt": "2026-09-07T13:50:05Z",
      "url": "https://wieslawsoltes.github.io/StratumCAD/",
      "documentTitle": "Stratum CAD · Riverside Studio"
    },
    {
      "repo": "AetherDiscovery",
      "title": "AetherDiscovery",
      "description": "3D engineering exploration and finite elements",
      "category": "simulation",
      "createdAt": "2026-09-06T21:20:05Z",
      "url": "https://wieslawsoltes.github.io/AetherDiscovery/",
      "documentTitle": "Aether Discovery — Engineering, in flow."
    },
    {
      "repo": "AetherField",
      "title": "AetherField",
      "description": "2D multiphysics and finite-element analysis",
      "category": "simulation",
      "createdAt": "2026-09-06T21:16:39Z",
      "url": "https://wieslawsoltes.github.io/AetherField/",
      "documentTitle": "AetherField — Multiphysics Workbench"
    },
    {
      "repo": "AetherOptics",
      "title": "AetherOptics",
      "description": "Optical design and ray tracing",
      "category": "simulation",
      "createdAt": "2026-09-06T20:55:49Z",
      "url": "https://wieslawsoltes.github.io/AetherOptics/",
      "documentTitle": "Aether Optics · Optical Design Studio"
    },
    {
      "repo": "FluxLab",
      "title": "FluxLab",
      "description": "Fluid dynamics laboratory",
      "category": "simulation",
      "createdAt": "2026-09-06T10:19:39Z",
      "url": "https://wieslawsoltes.github.io/FluxLab/",
      "documentTitle": "FluxLab — Fluid dynamics workbench"
    },
    {
      "repo": "FluxWorksStudio",
      "title": "FluxWorksStudio",
      "description": "Engineering simulation workbench",
      "category": "simulation",
      "createdAt": "2026-09-06T20:54:15Z",
      "url": "https://wieslawsoltes.github.io/FluxWorksStudio/",
      "documentTitle": "FluxWorks Studio · Simulation workbench"
    },
    {
      "repo": "StratumFrame",
      "title": "StratumFrame",
      "description": "Structural engineering analysis",
      "category": "simulation",
      "createdAt": "2026-09-06T20:44:05Z",
      "url": "https://wieslawsoltes.github.io/StratumFrame/",
      "documentTitle": "Stratum Frame — Structural Analysis Workbench"
    },
    {
      "repo": "AsterCAS",
      "title": "AsterCAS",
      "description": "Symbolic mathematics and algebra",
      "category": "simulation",
      "createdAt": "2026-09-06T11:51:18Z",
      "url": "https://wieslawsoltes.github.io/AsterCAS/",
      "documentTitle": "Aster CAS · Symbolic mathematics, beautifully connected"
    },
    {
      "repo": "AxiomStudio",
      "title": "AxiomStudio",
      "description": "Numeric computing and block simulation",
      "category": "simulation",
      "createdAt": "2026-09-06T11:01:44Z",
      "url": "https://wieslawsoltes.github.io/AxiomStudio/",
      "documentTitle": "Axiom Studio · Compute. Model. Understand."
    },
    {
      "repo": "AxiomWorksheet",
      "title": "AxiomWorksheet",
      "description": "Engineering calculations and worksheets",
      "category": "simulation",
      "createdAt": "2026-09-06T11:55:57Z",
      "url": "https://wieslawsoltes.github.io/AxiomWorksheet/",
      "documentTitle": "Axiom Worksheet — Cantilever beam"
    },
    {
      "repo": "AureliaProcess",
      "title": "AureliaProcess",
      "description": "Process simulation and flowsheets",
      "category": "industrial",
      "createdAt": "2026-09-07T20:23:20Z",
      "url": "https://wieslawsoltes.github.io/AureliaProcess/",
      "documentTitle": "Aurelia Process · Process simulation workspace"
    },
    {
      "repo": "VaporaProcessStudio",
      "title": "VaporaProcessStudio",
      "description": "Process flowsheet simulation",
      "category": "industrial",
      "createdAt": "2026-09-06T20:36:50Z",
      "url": "https://wieslawsoltes.github.io/VaporaProcessStudio/",
      "documentTitle": "Vapora — Process Studio"
    },
    {
      "repo": "AxiomPID",
      "title": "AxiomPID",
      "description": "Process and instrumentation diagrams",
      "category": "industrial",
      "createdAt": "2026-09-06T20:04:17Z",
      "url": "https://wieslawsoltes.github.io/AxiomPID/",
      "documentTitle": "Axiom P&ID — Process Engineering"
    },
    {
      "repo": "AxiomPlant",
      "title": "AxiomPlant",
      "description": "Plant piping and isometric design",
      "category": "industrial",
      "createdAt": "2026-09-06T10:21:33Z",
      "url": "https://wieslawsoltes.github.io/AxiomPlant/",
      "documentTitle": "Axiom Plant — Piping Engineering"
    },
    {
      "repo": "NexoraEngineering",
      "title": "NexoraEngineering",
      "description": "Plant, electrical and instrumentation engineering",
      "category": "industrial",
      "createdAt": "2026-09-07T10:16:42Z",
      "url": "https://wieslawsoltes.github.io/NexoraEngineering/",
      "documentTitle": "Nexora Engineering · Plant intelligence, connected."
    },
    {
      "repo": "RelayForgeAutomation",
      "title": "RelayForgeAutomation",
      "description": "PLC and automation engineering",
      "category": "industrial",
      "createdAt": "2026-09-06T21:10:54Z",
      "url": "https://wieslawsoltes.github.io/RelayForgeAutomation/",
      "documentTitle": "RelayForge Automation"
    },
    {
      "repo": "VoltWeave",
      "title": "VoltWeave",
      "description": "Electrical schematic design",
      "category": "industrial",
      "createdAt": "2026-09-06T19:35:55Z",
      "url": "https://wieslawsoltes.github.io/VoltWeave/",
      "documentTitle": "VoltWeave · Electrical Engineering"
    },
    {
      "repo": "VoltWeaveStudio",
      "title": "VoltWeaveStudio",
      "description": "Graphical instrumentation programming",
      "category": "industrial",
      "createdAt": "2026-09-06T21:03:57Z",
      "url": "https://wieslawsoltes.github.io/VoltWeaveStudio/",
      "documentTitle": "VoltWeave Studio · Signal Integrity Bench"
    },
    {
      "repo": "SilicoreStudio",
      "title": "SilicoreStudio",
      "description": "Electronic design, RTL and layout",
      "category": "industrial",
      "createdAt": "2026-09-06T21:20:38Z",
      "url": "https://wieslawsoltes.github.io/SilicoreStudio/",
      "documentTitle": "Silicore Studio · Aurora"
    },
    {
      "repo": "KineforgeStudio",
      "title": "KineforgeStudio",
      "description": "Robotic cell engineering",
      "category": "industrial",
      "createdAt": "2026-09-06T21:11:24Z",
      "url": "https://wieslawsoltes.github.io/KineforgeStudio/",
      "documentTitle": "Kineforge Studio · Robotic Cell Engineering"
    },
    {
      "repo": "ConvergeStudio",
      "title": "ConvergeStudio",
      "description": "BIM federation and coordination",
      "category": "buildings",
      "createdAt": "2026-09-06T21:10:14Z",
      "url": "https://wieslawsoltes.github.io/ConvergeStudio/",
      "documentTitle": "Converge Studio · Model Coordination"
    },
    {
      "repo": "StratumBIM",
      "title": "StratumBIM",
      "description": "Building information modeling",
      "category": "buildings",
      "createdAt": "2026-09-06T20:56:53Z",
      "url": "https://wieslawsoltes.github.io/StratumBIM/",
      "documentTitle": "Stratum BIM · Atelier House"
    },
    {
      "repo": "PlanforgeReview",
      "title": "PlanforgeReview",
      "description": "Construction document review and takeoff",
      "category": "buildings",
      "createdAt": "2026-09-06T20:35:56Z",
      "url": "https://wieslawsoltes.github.io/PlanforgeReview/",
      "documentTitle": "Planforge Review"
    },
    {
      "repo": "MeridianGISStudio",
      "title": "MeridianGISStudio",
      "description": "Geographic information and spatial analysis",
      "category": "buildings",
      "createdAt": "2026-09-06T20:34:56Z",
      "url": "https://wieslawsoltes.github.io/MeridianGISStudio/",
      "documentTitle": "Meridian GIS Studio"
    },
    {
      "repo": "Wayline",
      "title": "Wayline",
      "description": "Map exploration and geographic overlays",
      "category": "buildings",
      "createdAt": "2026-09-06T19:25:28Z",
      "url": "https://wieslawsoltes.github.io/Wayline/",
      "documentTitle": "Wayline — Your world, a little closer"
    },
    {
      "repo": "MeridianOffice",
      "title": "MeridianOffice",
      "description": "Documents, spreadsheets and presentations",
      "category": "office",
      "createdAt": "2026-09-07T10:20:41Z",
      "url": "https://wieslawsoltes.github.io/MeridianOffice/",
      "documentTitle": "Meridian Office — A little more possible."
    },
    {
      "repo": "Quire",
      "title": "Quire",
      "description": "Word-processing documents",
      "category": "office",
      "createdAt": "2026-09-07T13:48:30Z",
      "url": "https://wieslawsoltes.github.io/Quire/",
      "documentTitle": "Quire — The clarity report"
    },
    {
      "repo": "Gridline",
      "title": "Gridline",
      "description": "Spreadsheet calculations",
      "category": "office",
      "createdAt": "2026-09-07T13:49:10Z",
      "url": "https://wieslawsoltes.github.io/Gridline/",
      "documentTitle": "Gridline — A clearer way to work"
    },
    {
      "repo": "AureliaSlides",
      "title": "AureliaSlides",
      "description": "Presentation design",
      "category": "office",
      "createdAt": "2026-09-07T10:45:03Z",
      "url": "https://wieslawsoltes.github.io/AureliaSlides/",
      "documentTitle": "Aurelia Slides — Ideas in motion"
    },
    {
      "repo": "FolioForge",
      "title": "FolioForge",
      "description": "Editorial layout and publishing",
      "category": "office",
      "createdAt": "2026-09-07T10:44:24Z",
      "url": "https://wieslawsoltes.github.io/FolioForge/",
      "documentTitle": "FolioForge — Editorial Studio"
    },
    {
      "repo": "FolioPro",
      "title": "FolioPro",
      "description": "PDF editing and annotation",
      "category": "office",
      "createdAt": "2026-09-06T19:54:25Z",
      "url": "https://wieslawsoltes.github.io/FolioPro/",
      "documentTitle": "Folio Pro — Your documents, thoughtfully done."
    },
    {
      "repo": "MeridianPlan",
      "title": "MeridianPlan",
      "description": "Project planning and scheduling",
      "category": "office",
      "createdAt": "2026-09-06T20:32:12Z",
      "url": "https://wieslawsoltes.github.io/MeridianPlan/",
      "documentTitle": "Meridian Plan · Project scheduling"
    },
    {
      "repo": "NexoraDiagram",
      "title": "NexoraDiagram",
      "description": "Visual diagrams and workflows",
      "category": "office",
      "createdAt": "2026-09-06T19:29:06Z",
      "url": "https://wieslawsoltes.github.io/NexoraDiagram/",
      "documentTitle": "Nexora Diagram"
    },
    {
      "repo": "ForgeStudio",
      "title": "ForgeStudio",
      "description": "Code editing and development environment",
      "category": "development",
      "createdAt": "2026-09-06T19:47:31Z",
      "url": "https://wieslawsoltes.github.io/ForgeStudio/",
      "documentTitle": "Forge Studio — Nebula"
    },
    {
      "repo": "PageForgeStudio",
      "title": "PageForgeStudio",
      "description": "Visual website authoring",
      "category": "development",
      "createdAt": "2026-09-07T14:05:08Z",
      "url": "https://wieslawsoltes.github.io/PageForgeStudio/",
      "documentTitle": "PageForge Studio"
    },
    {
      "repo": "Asteria",
      "title": "Asteria",
      "description": "Binary analysis workbench",
      "category": "development",
      "createdAt": "2026-09-06T19:38:24Z",
      "url": "https://wieslawsoltes.github.io/Asteria/",
      "documentTitle": "Asteria — Binary Analysis Workbench"
    },
    {
      "repo": "Fluxweave",
      "title": "Fluxweave",
      "description": "Node-based visual programming",
      "category": "development",
      "createdAt": "2026-09-06T20:57:45Z",
      "url": "https://wieslawsoltes.github.io/Fluxweave/",
      "documentTitle": "Fluxweave · Visual programming"
    },
    {
      "repo": "LatticeAnalytics",
      "title": "LatticeAnalytics",
      "description": "Data analysis and interactive workbooks",
      "category": "development",
      "createdAt": "2026-09-06T20:53:11Z",
      "url": "https://wieslawsoltes.github.io/LatticeAnalytics/",
      "documentTitle": "Lattice Analytics — Commerce workbook"
    },
    {
      "repo": "AureonTerminal",
      "title": "AureonTerminal",
      "description": "Market charts and financial analytics",
      "category": "development",
      "createdAt": "2026-09-06T21:43:02Z",
      "url": "https://wieslawsoltes.github.io/AureonTerminal/",
      "documentTitle": "Aureon Terminal — Market workspace"
    },
    {
      "repo": "Frameforge",
      "title": "Frameforge",
      "description": "Video editing and timelines",
      "category": "media",
      "createdAt": "2026-09-07T10:19:57Z",
      "url": "https://wieslawsoltes.github.io/Frameforge/",
      "documentTitle": "Frameforge — Beyond"
    },
    {
      "repo": "PulsegridStudio",
      "title": "PulsegridStudio",
      "description": "Music production and sequencing",
      "category": "media",
      "createdAt": "2026-09-06T20:56:20Z",
      "url": "https://wieslawsoltes.github.io/PulsegridStudio/",
      "documentTitle": "Pulsegrid — After Hours"
    },
    {
      "repo": "SonoraStudio",
      "title": "SonoraStudio",
      "description": "Audio editing and processing",
      "category": "media",
      "createdAt": "2026-09-07T10:37:51Z",
      "url": "https://wieslawsoltes.github.io/SonoraStudio/",
      "documentTitle": "Sonora Studio — Audio, in its element."
    },
    {
      "repo": "SignalForgeStudio",
      "title": "SignalForgeStudio",
      "description": "Video capture and streaming studio",
      "category": "media",
      "createdAt": "2026-09-06T20:32:51Z",
      "url": "https://wieslawsoltes.github.io/SignalForgeStudio/",
      "documentTitle": "SignalForge Studio — Live production, reimagined"
    },
    {
      "repo": "Railbound",
      "title": "Railbound (Classic)",
      "description": "Original railway adventure",
      "category": "games",
      "createdAt": "2026-09-06T08:16:43Z",
      "url": "https://wieslawsoltes.github.io/Railbound/",
      "documentTitle": "Railbound Adventures · Big adventures. Little engineers."
    },
    {
      "repo": "RailboundAdventures",
      "title": "RailboundAdventures",
      "description": "Railway exploration and puzzle adventure",
      "category": "games",
      "createdAt": "2026-09-07T17:12:25Z",
      "url": "https://wieslawsoltes.github.io/RailboundAdventures/",
      "documentTitle": "Railbound Adventures · The railway is yours"
    },
    {
      "repo": "VantaForge",
      "title": "VantaForge",
      "description": "Game scenes and interactive worlds",
      "category": "games",
      "createdAt": "2026-09-06T20:43:24Z",
      "url": "https://wieslawsoltes.github.io/VantaForge/",
      "documentTitle": "Vanta Forge — Aether Relay"
    }
  ]
};
    for (const app of data.apps) {
        app.id = 'web-' + app.repo.toLowerCase();
        app.repository = 'https://github.com/' + data.owner + '/' + app.repo;
        Object.freeze(app);
    }
    data.categories.forEach(Object.freeze);
    Object.freeze(data.apps); Object.freeze(data.categories);
    const catalog = Object.freeze(data);
    globalThis.AsterWebCatalog = catalog;
    if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
})();
