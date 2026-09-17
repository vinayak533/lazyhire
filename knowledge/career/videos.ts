import type { TutorSource } from "../../lib/career-tutor/types";

/**
 * Verified YouTube learning videos.
 *
 * Every ID below was checked against YouTube's oEmbed endpoint on the date in
 * `videosVerifiedAt`; the stored title and channel are what YouTube returned.
 * The runtime re-verifies each video through oEmbed before rendering a card and
 * drops any that YouTube no longer serves. Nothing here is invented, and no
 * video is attached to an answer unless its topics match the question.
 */
export const videosVerifiedAt = "2026-09-12T00:00:00.000Z";

export interface VideoEntry {
  id: string;
  title: string;
  channel: string;
  /** Subjects this video genuinely teaches; matched against role/topic tags. */
  topics: string[];
  description: string;
}

const v = (id: string, title: string, channel: string, topics: string[], description: string): VideoEntry => ({ id, title, channel, topics, description });

export const videoRegistry: VideoEntry[] = [
  // Programming languages and web
  v("rfscVS0vtbw", "Learn Python - Full Course for Beginners [Tutorial]", "freeCodeCamp.org", ["python", "python-beginner"], "A complete beginner course covering Python syntax, data types, functions, files and error handling."),
  v("8DvywoWv6fI", "Python for Everybody - Full University Python Course", "freeCodeCamp.org", ["python", "python-beginner"], "Dr. Chuck's university-style introduction to programming with Python, including data and web access."),
  v("jBzwzrDvZ18", "Python Backend Web Development Course (with Django)", "freeCodeCamp.org", ["python-backend", "backend", "django", "python"], "Builds backend web applications in Python with Django: models, views, templates, auth and deployment basics."),
  v("tLKKmouUams", "FastAPI Course for Beginners", "freeCodeCamp.org", ["python-backend", "fastapi", "api", "backend"], "Introduces building REST APIs in Python with FastAPI, request validation and automatic documentation."),
  v("o0XbHvKxw7Y", "Django For Everybody - Full Python University Course", "freeCodeCamp.org", ["django", "python-backend"], "A full university course on Django covering models, forms, sessions, authentication and deployment."),
  v("grEKMHGYyns", "Learn Java 8 - Full Tutorial for Beginners", "freeCodeCamp.org", ["java", "java-beginner"], "A beginner Java course covering the language basics, object-oriented programming and the standard library."),
  v("9SGDpanrc8U", "Spring Boot Tutorial | Full Course [2023] [NEW]", "Amigoscode", ["java", "spring", "java-backend", "backend"], "Builds a Spring Boot REST service from scratch, including data persistence and project structure."),
  v("jS4aFq5-91M", "JavaScript Programming - Full Course", "freeCodeCamp.org", ["javascript", "frontend", "web"], "A long-form JavaScript course that moves from fundamentals to building small projects."),
  v("30LWjhZzg50", "Learn TypeScript – Full Tutorial", "freeCodeCamp.org", ["typescript", "javascript", "frontend"], "Covers TypeScript types, interfaces, generics and how to add typing to JavaScript projects."),
  v("bMknfKXIFA8", "React Course - Beginner's Tutorial for React JavaScript Library [2022]", "freeCodeCamp.org", ["react", "frontend"], "A project-based introduction to React components, state, props and hooks."),
  v("wm5gMKuwSYk", "Next.js Full Course 2024 | Build and Deploy a Full Stack App Using the Official React Framework", "JavaScript Mastery", ["nextjs", "react", "fullstack"], "Builds and deploys a full-stack application with the Next.js App Router."),
  v("Oe421EPjeBE", "Node.js and Express.js - Full Course", "freeCodeCamp.org", ["node", "javascript-backend", "backend", "api"], "Teaches Node.js and Express for building servers and REST APIs, with middleware and routing."),
  v("LzMnsfqjzkA", "Become a Fullstack Developer from Scratch – Full Beginner’s Tutorial", "freeCodeCamp.org", ["fullstack", "web", "frontend", "backend"], "A very long beginner path through HTML, CSS, JavaScript, backend basics and deployment."),
  v("GxmfcnU3feo", "The Complete Web Development Roadmap", "Programming with Mosh", ["web", "frontend", "fullstack", "roadmap"], "A short overview of the skills and order in which to learn them for web development."),
  v("Je_KYIM9QJc", "How To Become a Full Stack Developer in 2025 - Full Roadmap", "Tech With Tim", ["fullstack", "roadmap"], "A roadmap-style overview of the frontend, backend and deployment skills a full-stack developer needs."),
  v("HXV3zeQKqGY", "SQL Tutorial - Full Database Course for Beginners", "freeCodeCamp.org", ["sql", "database", "data-analytics", "backend"], "A full SQL course covering relational databases, queries, joins and schema design."),
  v("RGOj5yH7evk", "Git and GitHub for Beginners - Crash Course", "freeCodeCamp.org", ["git"], "A crash course on Git version control and collaborating through GitHub."),
  v("ZtqBQ68cfJc", "The 50 Most Popular Linux & Terminal Commands - Full Course for Beginners", "freeCodeCamp.org", ["linux", "devops"], "Practical Linux command-line skills for developers, testers and operations work."),
  v("RBSGKlAvoiM", "Data Structures Easy to Advanced Course - Full Tutorial from a Google Engineer", "freeCodeCamp.org", ["dsa", "coding-interview"], "Data structures explained with implementations, useful preparation for coding rounds."),
  v("F2FmTdLtb_4", "System Design Concepts Course and Interview Prep", "freeCodeCamp.org", ["system-design", "coding-interview"], "Core system design concepts and how to approach a system design interview."),
  v("VPvVD8t02U8", "Flutter Course for Beginners – 37-hour Cross Platform App Development Tutorial", "freeCodeCamp.org", ["mobile", "flutter"], "A long-form Flutter course for building cross-platform mobile apps."),
  // Data
  v("ua-CiDNNj30", "Learn Data Science Tutorial - Full Course for Beginners", "freeCodeCamp.org", ["data-science"], "An introductory data science course covering the workflow, tools and core techniques."),
  v("uD8DfbJrqRI", "Data Scientists Career Video", "CareerOneStop", ["data-science", "career-overview"], "A short occupational overview of data-science work linked from the US Bureau of Labor Statistics."),
  v("r-uOLxNrNk8", "Data Analysis with Python - Full Course for Beginners (Numpy, Pandas, Matplotlib, Seaborn)", "freeCodeCamp.org", ["data-analytics", "pandas", "python-data", "data-science"], "Hands-on data analysis in Python with NumPy, Pandas and plotting libraries."),
  v("gtjxAH8uaP0", "Pandas & Python for Data Analysis by Example – Full Course for Beginners", "freeCodeCamp.org", ["pandas", "data-analytics", "python-data"], "Pandas taught through worked examples: loading, cleaning, grouping and joining data."),
  v("xxpc-HPKN28", "Statistics - A Full University Course on Data Science Basics", "freeCodeCamp.org", ["statistics", "data-science", "data-analytics"], "A full statistics course covering the concepts data roles rely on."),
  v("Vl0H-qTclOg", "Microsoft Excel Tutorial for Beginners - Full Course", "freeCodeCamp.org", ["excel", "data-analytics", "accounting"], "Spreadsheet fundamentals: formulas, formatting, tables and charts."),
  v("FwjaHCVNBWA", "Power BI for Data Analytics - Full Course for Beginners", "Luke Barousse", ["power-bi", "bi", "data-analytics"], "Builds reports and dashboards in Power BI with real analytics workflows."),
  v("TPMlZxRRaBQ", "Tableau for Data Science and Data Visualization - Crash Course Tutorial", "freeCodeCamp.org", ["tableau", "bi", "data-analytics"], "A crash course on visualising data and building dashboards in Tableau."),
  v("cnjhHZNJEDk", "2026 FREE Data Analyst Bootcamp [24 Hours+] for FREE | SQL, Excel, Python, Power BI, GitHub, AWS", "Alex The Analyst", ["data-analytics", "data-analyst", "sql", "power-bi"], "A long free bootcamp covering the everyday data analyst toolkit end to end."),
  v("YRJbhFLLPyE", "The Complete Data Analyst Roadmap", "Programming with Mosh", ["data-analyst", "data-analytics", "roadmap"], "A short roadmap of the skills to learn, in order, for data analyst roles."),
  v("PHsC_t0j1dU", "Data Engineering Course for Beginners", "freeCodeCamp.org", ["data-engineering"], "Introduces pipelines, data modelling, storage and orchestration for data engineering."),
  // AI / ML / GenAI
  v("i_LwzRVP7bg", "Machine Learning for Everybody – Full Course", "freeCodeCamp.org", ["machine-learning", "ai"], "A practical introduction to supervised and unsupervised learning with Python."),
  v("7IgVGSaQPaw", "The Complete Machine Learning Roadmap", "Programming with Mosh", ["machine-learning", "roadmap"], "A concise roadmap for learning machine learning from the maths up to deployment."),
  v("PpiqSDMi4-4", "How I'd Become a Machine Learning Engineer in 2026 (full roadmap)", "Egor Howell", ["ml-engineer", "machine-learning", "roadmap"], "A practitioner's roadmap for machine learning engineering roles."),
  v("VyWAvY2CF9c", "Deep Learning Crash Course for Beginners", "freeCodeCamp.org", ["deep-learning", "ai"], "Neural networks, training and common architectures explained for beginners."),
  v("V_xro1bcAuA", "PyTorch for Deep Learning & Machine Learning – Full Course", "freeCodeCamp.org", ["pytorch", "deep-learning"], "A long, hands-on PyTorch course from tensors to trained models."),
  v("zjkBMFhNj_g", "[1hr Talk] Intro to Large Language Models", "Andrej Karpathy", ["llm", "generative-ai", "llm-engineering"], "A one-hour conceptual introduction to how large language models are trained and used."),
  v("kCc8FmEb1nY", "Let's build GPT: from scratch, in code, spelled out.", "Andrej Karpathy", ["llm", "llm-engineering", "deep-learning"], "Builds a small GPT-style model from scratch, explaining attention and training in code."),
  v("mEsleV16qdo", "Generative AI Full Course – Gemini Pro, OpenAI, Llama, Langchain, Pinecone, Vector Databases & More", "freeCodeCamp.org", ["generative-ai", "llm-engineering", "ai-engineering", "rag"], "A long generative AI course covering model APIs, LangChain, embeddings and vector databases."),
  v("nJ25yl34Uqw", "GenAI Essentials – Full Course for Beginners", "freeCodeCamp.org", ["generative-ai", "ai-engineering"], "Foundations of generative AI for people building with it: models, prompting, tooling and evaluation."),
  v("Zy7EXDONlTY", "Agentic AI – Complete Course for Beginners", "freeCodeCamp.org", ["ai-agents", "ai-engineering", "llm-engineering"], "Introduces agent architectures, tool use and orchestration for LLM-based systems."),
  v("xZDB1naRUlk", "Development with Large Language Models Tutorial – OpenAI, Langchain, Agents, Chroma", "freeCodeCamp.org", ["llm-engineering", "langchain", "ai-engineering"], "Practical application development with LLM APIs, LangChain, agents and a vector store."),
  v("sVcwVQRHIc8", "Learn RAG From Scratch – Python AI Tutorial from a LangChain Engineer", "freeCodeCamp.org", ["rag", "llm-engineering", "ai-engineering"], "Retrieval-augmented generation built step by step in Python."),
  v("_ZvnD73m40o", "Prompt Engineering Tutorial – Master ChatGPT and LLM Responses", "freeCodeCamp.org", ["prompt-engineering", "generative-ai"], "Techniques for writing effective prompts and structuring LLM interactions."),
  // DevOps, cloud, security
  v("fqMOX6JJhGo", "Docker Tutorial for Beginners - A Full DevOps Course on How to Run Applications in Containers", "freeCodeCamp.org", ["docker", "devops", "containers"], "Containers explained with Docker: images, volumes, networking and Compose."),
  v("d6WC5n9G_sM", "Kubernetes Course - Full Beginners Tutorial (Containerize Your Apps!)", "freeCodeCamp.org", ["kubernetes", "devops"], "A beginner course on deploying and managing containerised applications with Kubernetes."),
  v("X48VuDVv0do", "Kubernetes Tutorial for Beginners [FULL COURSE in 4 Hours]", "TechWorld with Nana", ["kubernetes", "devops"], "A widely used four-hour Kubernetes course covering core objects and a demo project."),
  v("j5Zsa_eOXeY", "DevOps Engineering Course for Beginners", "freeCodeCamp.org", ["devops"], "Introduces DevOps practices, CI/CD, infrastructure and monitoring for beginners."),
  v("1J2YOV6LcwY", "Complete DevOps Roadmap 2026 - Master these 4 Levels!", "TechWorld with Nana", ["devops", "roadmap"], "A levelled roadmap for building DevOps skills in a sensible order."),
  v("6GQRb4fGvtk", "The Complete DevOps Roadmap", "Programming with Mosh", ["devops", "roadmap"], "A short roadmap of DevOps tools and concepts."),
  v("SLB_c_ayRMo", "Terraform Course - Automate your AWS cloud infrastructure", "freeCodeCamp.org", ["terraform", "devops", "cloud", "aws"], "Infrastructure as code with Terraform on AWS."),
  v("SOTamWNgDKc", "AWS Certified Cloud Practitioner Certification Course (CLF-C01) - Pass the Exam!", "freeCodeCamp.org", ["aws", "cloud"], "A full course on AWS fundamentals aligned to the Cloud Practitioner exam; check the current exam version before booking."),
  v("NKEFWyqJ5XA", "Microsoft Azure Fundamentals Certification Course (AZ-900) - Pass the exam in 3 hours!", "freeCodeCamp.org", ["azure", "cloud"], "Azure fundamentals aligned to AZ-900; verify the current exam outline separately."),
  v("6eroP2XGtTI", "Cloud Engineer Roadmap | From Beginner to Advanced", "TechWorld with Nana", ["cloud", "roadmap"], "A roadmap for cloud engineering skills from Linux and networking to infrastructure as code."),
  v("qiQR5rTSshw", "Computer Networking Course - Network Engineering [CompTIA Network+ Exam Prep]", "freeCodeCamp.org", ["networking", "cybersecurity"], "A networking fundamentals course useful for network, cloud and security roles."),
  v("9HOpanT0GRs", "Harvard CS50’s Intro to Cybersecurity – Full University Course", "freeCodeCamp.org and CS50", ["cybersecurity"], "Harvard's introductory cybersecurity course covering threats, defences and security thinking."),
  v("ug8W0sFiVJo", "Hands-On Cybersecurity and Ethical Hacking – Full Course", "freeCodeCamp.org", ["cybersecurity", "ethical-hacking"], "Hands-on security labs and ethical hacking fundamentals."),
  v("_DVVNOGYtmU", "Cybersecurity for Beginners | Google Cybersecurity Certificate", "Grow with Google", ["cybersecurity"], "Google's beginner-level cybersecurity introduction from its certificate programme."),
  v("v7BNtpw53AA", "The Complete Cybersecurity Roadmap: Land a Cybersecurity Job in 10 Months", "Programming with Mosh", ["cybersecurity", "roadmap"], "A short roadmap of skills to learn for entry-level security work."),
  v("3Kq1MIfTWCE", "Full Ethical Hacking Course - Network Penetration Testing for Beginners (2019)", "freeCodeCamp.org", ["ethical-hacking", "penetration-testing", "cybersecurity"], "Network penetration testing fundamentals in a lab setting; practise only on systems you are authorised to test."),
  // QA
  v("sO8eGL6SFsA", "Software Testing Full Course In 10 Hours | Software Testing Tutorial | Edureka", "edureka!", ["qa", "testing", "manual-testing"], "A long course spanning manual testing concepts through automation basics."),
  v("j7VZsCCnptM", "Selenium Course for Beginners - Web Scraping Bots, Browser Automation, Testing (Tutorial)", "freeCodeCamp.org", ["selenium", "qa", "automation"], "Browser automation and testing with Selenium in Python."),
  v("jydYq7oAtD8", "Software Testing Course – Playwright, E2E, and AI Agents", "freeCodeCamp.org and Beau Carnes", ["playwright", "qa", "automation", "testing"], "End-to-end testing with Playwright and how AI tooling fits into modern test workflows."),
  v("788GvvcfwTY", "#1 Playwright Automation Using TypeScript Full Course 2026 | Playwright TypeScript Beginner Tutorial", "Testers Talk", ["playwright", "qa", "automation"], "A long Playwright with TypeScript course for automation testers."),
  // UX / design
  v("c9Wg6Cb_YlU", "UI / UX Design Tutorial – Wireframe, Mockup & Design in Figma", "freeCodeCamp.org", ["ux", "ui", "figma", "design"], "Wireframing, mockups and visual design in Figma for beginners."),
  v("QJBP2uy8LcU", "Free Figma UX Design UI Essentials Course", "Bring Your Own Laptop", ["figma", "ux", "ui"], "A Figma-based UX/UI essentials course."),
  v("R7urbI0iqb0", "10 Years of UX Product Research Experience in 4.5 hours - Ultimate Crash Course", "Kevin Liang | Zero to UX", ["ux-research", "ux"], "A crash course on UX research methods and how to run studies."),
  // Product and business analysis
  v("5nAeyqNuZYU", "Product Management 101: Everything You Need to Know (Full Course)", "Explained Hub", ["product-management"], "An overview course on what product managers do and the core skills involved."),
  v("KjYCEiBTHFo", "AI Product Management - Complete Course - 3.5 hours - Masterclass | AI Agents, RAG, Evals, LLMs.", "HelloPM", ["product-management", "ai-product"], "Product management for AI-powered products: agents, retrieval, evaluation and LLM basics."),
  v("UBVzucVpG7k", "Business Analyst Full Course In 2 Hours | Business Analyst Training For Beginners | Simplilearn", "Simplilearn", ["business-analysis"], "A two-hour introduction to business analysis roles, techniques and deliverables."),
  v("YJucKlGa0ZE", "Fastest Way to Become a Business Analyst (Business Analyst Roadmap)", "Mo Chen", ["business-analysis", "roadmap"], "A short roadmap for moving into business analyst roles."),
  // Accounting and finance
  v("yYX4bvQSqbo", "ACCOUNTING BASICS: a Guide to (Almost) Everything", "Accounting Stuff", ["accounting"], "A compact guide to the core ideas of accounting: the equation, debits and credits, and the statements."),
  v("v-djL7SPw4c", "Full Financial Accounting Course in One Video (10 Hours)", "Tony Bell", ["accounting", "financial-accounting"], "A full financial accounting course from journal entries to the financial statements."),
  v("hTU6HE64Wd0", "Accounting Crash Course - Be job ready in 1.5 hours!", "Learn Accounting Finance", ["accounting"], "A practical accounting crash course aimed at entry-level accounting work."),
  v("VYNTBWBqncU", "Accounting Basics Explained Through a Story", "Leila Gharani", ["accounting"], "Accounting fundamentals explained through a simple business story."),
  v("m_SH0TOLsIc", "Excel for Accounting - 10 Excel Functions You NEED to KNOW!", "Leila Gharani", ["accounting", "excel"], "The spreadsheet functions accountants use most, with examples."),
  v("CqZSxeo9gUQ", "Complete CA Roadmap 2026: Exams, Articleship, Careers & Salary | CA Nandini Agrawal", "Nandini Agrawal", ["chartered-accountant", "accounting", "roadmap"], "An overview of the Chartered Accountancy route in India; confirm current exam rules and fees with ICAI."),
  v("Rmi9fwkJjHw", "Build a 3-Statement Financial Model [Free Course]", "Wall Street Prep", ["finance", "financial-modeling", "financial-analyst"], "Builds a linked three-statement financial model in Excel."),
  v("64A6HJDEbKA", "Learn Financial Modeling Essentials in Excel (FREE Crash Course)", "Kenji Explains", ["finance", "financial-modeling", "financial-analyst"], "A short crash course on financial modelling essentials in Excel."),
  // Marketing
  v("kunkYTKFNtI", "Digital Marketing with AI Full Course for Beginners in 4 HOURS - 2025 Updated [No Experience Needed]", "WsCube Tech", ["digital-marketing"], "A beginner digital marketing course spanning SEO, paid ads, social and analytics."),
  v("h95cQkEWBx0", "Digital Marketing 101 (A Beginner’s Guide To Marketing)", "Adam Erhart", ["digital-marketing", "marketing"], "A short introduction to how digital marketing channels fit together."),
  v("nkNHn0VqVBA", "Digital Marketing Full Course - 10 Hours [2024] | Digital Marketing Tutorial for Beginners | Edureka", "edureka!", ["digital-marketing"], "A ten-hour digital marketing course covering the major channels and tools."),
  v("xsVTqzratPs", "Complete SEO Course for Beginners: Learn to Rank #1 in Google", "Ahrefs", ["seo", "digital-marketing"], "A complete beginner SEO course from a well-known SEO tool vendor."),
  // HR
  v("c8_avX9miag", "INTRODUCTION INTO HUMAN RESOURCES MANAGEMENT - LECTURE 01", "Armin Trost", ["hr", "human-resources"], "A university lecture introducing human resources management."),
  v("c1npicEPaHw", "Complete HR Management Crash Course | 2-Hour Masterclass", "Leaders Talk - ThinkEduca", ["hr", "human-resources"], "A two-hour crash course on the functions of HR management."),
  v("zIm_k9j0C50", "40 Most Asked HR Interview Questions and Answers | HR Interview Questions with Answers 2025", "upGrad", ["hr-interview", "interview"], "Common HR-round interview questions with model answers."),
  v("RLVaBrFxhhA", "Recruiter Interview Questions and Answers - For Freshers and Experienced Candidates.", "CareerRide", ["hr", "recruiter", "hr-interview"], "Interview preparation for recruiter and talent-acquisition roles."),
  // Careers, résumés, interviews
  v("Tt08KmFfIYQ", "Write an Incredible Resume: 5 Golden Rules!", "Jeff Su", ["resume"], "Five practical rules for writing a clear, evidence-based résumé."),
  v("eGmZZFJ-8PY", "Ex-Google Recruiter Explains: 6 Résumé Secrets That Get You Hired", "Farah Sharghi", ["resume"], "A recruiter's view of what makes a résumé easy to shortlist."),
  v("LcohcyoCXn8", "Resume Writing: How to Create a Strong Resume 📝 | Indeed", "Indeed", ["resume"], "A short résumé-writing guide from a job board's career team."),
  v("uQEuo7woEEk", "STAR INTERVIEW QUESTIONS & ANSWERS! (The STAR TECHNIQUE for Behavioural Interview Questions!)", "CareerVidz", ["behavioral-interview", "interview"], "How to structure behavioural answers with the STAR technique."),
  v("CAda15Tawlg", "Behavioral Interview: Common Questions Broken Down by Ex-Meta & Amazon Senior Managers", "Hello Interview", ["behavioral-interview", "interview"], "Behavioural questions analysed by former hiring managers."),
  v("DHDrj0_bMQ0", "How to Ace an Interview: 5 Tips from a Harvard Career Advisor", "Harvard Extension School", ["interview"], "Five interview tips from a university career advisor."),
];

const byId = new Map(videoRegistry.map((video) => [video.id, video]));
export function videoById(id: string) {
  return byId.get(id) ?? null;
}

/** Registry metadata as a TutorSource, before live oEmbed re-verification. */
export function videoSource(video: VideoEntry): TutorSource {
  return {
    id: `youtube-${video.id}`,
    kind: "youtube",
    title: video.title,
    channel: video.channel,
    provider: video.channel,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnail: `/api/career-tutor/thumbnail?id=${video.id}`,
    description: video.description,
    supports: "Learning material for the topic named in the answer; not a personalised roadmap or a hiring prediction.",
    verifiedAt: videosVerifiedAt,
  };
}

/**
 * Topic tags implied by a role or subject string. Only clear signals map to a
 * topic, so "accountant" never reaches the data-science videos and a generic
 * "engineer" reaches nothing at all.
 */
const topicSignals: Array<[RegExp, string[]]> = [
  [/\bchartered accountant|\bca\b|\bicai\b/i, ["chartered-accountant", "accounting"]],
  [/\baccount(?:ant|ing|s)\b|book-?keep|\btally\b|\bgst\b/i, ["accounting"]],
  [/financial (?:analyst|model)|investment bank|equity research|\bcfa\b|corporate finance/i, ["financial-modeling", "finance"]],
  [/digital marketing|\bmarketing\b|performance marketing|social media marketing/i, ["digital-marketing"]],
  [/\bseo\b/i, ["seo", "digital-marketing"]],
  [/\bhr\b|human resource|recruit(?:er|ment)|talent acquisition/i, ["hr"]],
  [/\bux\b|\bui\b|user experience|product design|interaction design|\bfigma\b/i, ["ux", "figma"]],
  [/product manag|\bpm\b(?! ?2)|product owner/i, ["product-management"]],
  [/business analy/i, ["business-analysis"]],
  [/\bqa\b|quality assurance|software test|test(?:ing)? engineer|automation test|\bsdet\b/i, ["qa", "testing"]],
  [/playwright/i, ["playwright"]],
  [/selenium/i, ["selenium"]],
  [/cyber ?security|information security|\binfosec\b|security analyst|\bsoc\b analyst/i, ["cybersecurity"]],
  [/ethical hack|penetration test|pentest/i, ["ethical-hacking", "penetration-testing"]],
  [/network(?:ing)? engineer|network admin/i, ["networking"]],
  [/\bdevops\b|site reliability|\bsre\b|platform engineer/i, ["devops"]],
  [/kubernetes|\bk8s\b/i, ["kubernetes"]],
  [/\bdocker\b|container/i, ["docker"]],
  [/terraform|infrastructure as code/i, ["terraform"]],
  [/\baws\b/i, ["aws", "cloud"]],
  [/\bazure\b/i, ["azure", "cloud"]],
  [/\bcloud\b/i, ["cloud"]],
  [/\blinux\b/i, ["linux"]],
  [/data engineer/i, ["data-engineering"]],
  [/data scien/i, ["data-science"]],
  [/data analy|business intelligence|\bbi\b analyst/i, ["data-analytics", "data-analyst"]],
  [/power ?bi/i, ["power-bi"]],
  [/tableau/i, ["tableau"]],
  [/\bexcel\b|spreadsheet/i, ["excel"]],
  [/\bpandas\b/i, ["pandas"]],
  [/statistic/i, ["statistics"]],
  [/\bml engineer|machine learning engineer|mlops/i, ["ml-engineer", "machine-learning"]],
  [/machine learning|\bml\b/i, ["machine-learning"]],
  [/deep learning|neural net|pytorch|tensorflow/i, ["deep-learning"]],
  [/\brag\b|retrieval[- ]augmented/i, ["rag"]],
  [/\bllm\b|large language model|llm engineer/i, ["llm", "llm-engineering"]],
  [/prompt engineer/i, ["prompt-engineering"]],
  [/ai agent|agentic/i, ["ai-agents"]],
  [/generative ai|\bgenai\b|gen ai/i, ["generative-ai"]],
  [/\bai engineer|artificial intelligence engineer/i, ["ai-engineering", "generative-ai"]],
  [/\bai\b|artificial intelligence/i, ["ai", "machine-learning"]],
  [/system design/i, ["system-design"]],
  [/\bdsa\b|data structures|algorithms|coding interview|leetcode/i, ["dsa", "coding-interview"]],
  [/\bresume\b|\bcv\b/i, ["resume"]],
  [/behaviou?ral interview|\bstar\b (?:method|technique)/i, ["behavioral-interview"]],
  [/\bhr\b interview|hr round/i, ["hr-interview"]],
  [/\binterview\b/i, ["interview"]],
  [/\bflutter\b|mobile (?:app )?develop|android|\bios\b/i, ["mobile", "flutter"]],
  [/next\.?js/i, ["nextjs", "react"]],
  [/\breact\b/i, ["react"]],
  [/typescript/i, ["typescript"]],
  [/node(?:\.js)?|express(?:\.js)?/i, ["node", "javascript-backend"]],
  [/javascript|\bjs\b/i, ["javascript"]],
  [/front[- ]?end|web develop/i, ["frontend", "web"]],
  [/full[- ]?stack/i, ["fullstack"]],
  [/spring boot|\bspring\b/i, ["spring", "java-backend"]],
  [/\bjava\b(?!script)/i, ["java"]],
  [/django/i, ["django", "python-backend"]],
  [/fastapi|flask/i, ["fastapi", "python-backend"]],
  [/python.*back[- ]?end|back[- ]?end.*python/i, ["python-backend"]],
  [/\bpython\b/i, ["python"]],
  [/back[- ]?end|\bapi\b developer/i, ["backend"]],
  [/\bsql\b|database/i, ["sql"]],
  [/\bgit\b|github/i, ["git"]],
];

/** Topics implied by a subject, most specific first (signal order). */
export function topicsFor(subject: string): string[] {
  const topics: string[] = [];
  for (const [pattern, tags] of topicSignals) {
    if (!pattern.test(subject)) continue;
    for (const tag of tags) if (!topics.includes(tag)) topics.push(tag);
  }
  return topics;
}

/**
 * Videos that genuinely match a subject. Each video must share at least one
 * specific topic with the subject; generic tags alone ("roadmap") never match.
 * Earlier-detected (more specific) topics weigh more, so "digital marketing
 * with AI" prefers marketing videos over machine-learning ones.
 */
export function videosForSubject(subject: string, limit = 2): VideoEntry[] {
  const topics = topicsFor(subject);
  if (!topics.length) return [];
  const generic = new Set(["roadmap", "career-overview"]);
  // Exponential weights: the first (most specific) topic outweighs every later one combined.
  const weight = new Map(topics.map((topic, index) => [topic, 2 ** (topics.length - index)]));
  return videoRegistry
    .map((video) => ({
      video,
      score: video.topics.reduce((sum, topic) => sum + (generic.has(topic) ? 0 : (weight.get(topic) ?? 0)), 0),
      roadmap: video.topics.includes("roadmap"),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.roadmap) - Number(a.roadmap))
    .slice(0, limit)
    .map((item) => item.video);
}
