import type { KnowledgeEntry, ResourceKind, TutorSource } from "../../lib/career-tutor/types";
import { videoById, videoSource } from "./videos";

// Individually authored questions. Alternate phrasings are not counted as entries.
// Resource scope is explicit: learning material does not substantiate a hiring guarantee.
const checked = "2026-09-09T00:00:00.000Z";
/** Every URL added on this date returned HTTP 200 when fetched during authoring. */
const checkedExpansion = "2026-09-12T00:00:00.000Z";
// Legacy catalogue entries are official documentation or public bodies unless noted.
const resource = (id: string, title: string, url: string, supports: string, kind: ResourceKind = "official"): TutorSource => ({id, title, url, supports, description: supports, kind, provider: new URL(url).hostname.replace(/^www\./, ""), verifiedAt: checked});
const typed = (kind: ResourceKind, provider: string, id: string, title: string, url: string, description: string, supports = description): TutorSource =>
  ({id, title, url, description, supports, kind, provider, verifiedAt: checkedExpansion});
const official = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("official", provider, id, title, url, description, supports);
const learning = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("learning", provider, id, title, url, description, supports);
const course = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("course", provider, id, title, url, description, supports);
const github = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("github", provider, id, title, url, description, supports);
const article = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("article", provider, id, title, url, description, supports);
const career = (id: string, provider: string, title: string, url: string, description: string, supports?: string) => typed("career", provider, id, title, url, description, supports);

export const sources = {
  python: resource("python-tutorial", "The Python Tutorial", "https://docs.python.org/3/tutorial/", "Official exercises and explanations for practicing Python language fundamentals."),
  sql: resource("postgres-tutorial", "PostgreSQL tutorial", "https://www.postgresql.org/docs/current/tutorial.html", "Official introduction to relational databases and SQL; practice material for the suggested learning sequence."),
  ml: resource("google-ml", "Google Machine Learning Crash Course", "https://developers.google.com/machine-learning/crash-course", "Learning modules for machine-learning concepts and evaluation; the career roadmap is mentor advice.", "course"),
  data: resource("bls-data-scientists", "Data scientists: occupational overview", "https://www.bls.gov/ooh/math/data-scientists.htm", "US occupational context for data-science work. Its salaries and education summaries must not be generalized to India or individual employers.", "career"),
  occupations: resource("onet", "Explore occupations with O*NET", "https://www.onetonline.org/", "US occupational descriptions for exploring tasks and interests; a starting point, not a personal suitability assessment.", "career"),
  jobs: resource("ncs", "National Career Service", "https://ncs.gov.in/", "India's official National Career Service portal for exploring employment resources. Verify individual opportunities separately.", "career"),
  resume: resource("harvard-resume", "Harvard guide to creating a strong resume", "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/", "Resume-writing guidance on clear, specific, factual descriptions and tailoring to a position.", "career"),
  web: resource("mdn-learning", "MDN: Learn web development", "https://developer.mozilla.org/en-US/docs/Learn_web_development", "Web-development learning material; use it to practice the foundations suggested in this answer."),
  security: resource("nist-nice", "NIST NICE Framework Resource Center", "https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resource-center", "Cybersecurity work-role and learning vocabulary; not a guarantee that a role or credential is required by an employer."),
  aws: resource("aws-certification", "AWS Certification", "https://aws.amazon.com/certification/", "Official provider catalogue. Check the selected exam page for current scope, availability, and fees before booking."),
  microsoft: resource("microsoft-credentials", "Microsoft credentials", "https://learn.microsoft.com/en-us/credentials/", "Official provider catalogue for checking credential details; recommendations about whether to buy one are mentor advice."),
  access: resource("w3c-tutorials", "W3C accessibility tutorials", "https://www.w3.org/WAI/tutorials/", "Practical accessibility patterns to use when evaluating forms, navigation, and other interface components."),
  product: resource("atlassian-product", "Atlassian: Product management", "https://www.atlassian.com/agile/product-management", "Product-management learning material; the proposed portfolio exercises are mentor recommendations.", "learning"),
  seo: resource("google-seo", "Google SEO Starter Guide", "https://developers.google.com/search/docs/fundamentals/seo-starter-guide", "Google's search optimization guidance; it does not promise rankings or employment outcomes."),
  git: resource("git-book", "Pro Git", "https://git-scm.com/book/en/v2", "Official Git reference for version-control practice; it does not describe any employer's workflow."),
  linux: resource("linux-journey", "The Linux Documentation Project guides", "https://tldp.org/guides.html", "Community Linux guides for practising shell and system fundamentals; verify commands against your own distribution.", "learning"),
  javascript: resource("mdn-javascript", "MDN JavaScript guide", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "Official JavaScript language reference and guide used as practice material for the suggested sequence."),
  react: resource("react-learn", "Learn React", "https://react.dev/learn", "Official React tutorial and reference; it teaches the library, not any company's hiring bar."),
  android: resource("android-training", "Android developer training", "https://developer.android.com/courses", "Official Android learning paths for practising mobile development; availability of courses changes over time.", "course"),
  flutter: resource("flutter-docs", "Flutter documentation", "https://docs.flutter.dev/", "Official cross-platform framework documentation used as practice material."),
  docker: resource("docker-docs", "Docker documentation", "https://docs.docker.com/get-started/", "Official container documentation for practising packaging and local environments."),
  kubernetes: resource("kubernetes-docs", "Kubernetes documentation", "https://kubernetes.io/docs/home/", "Official orchestration documentation; treat it as learning material, not a claim about job requirements."),
  testing: resource("playwright-docs", "Playwright documentation", "https://playwright.dev/docs/intro", "Official end-to-end testing documentation used for practising automated checks."),
  statistics: resource("openintro", "OpenIntro Statistics", "https://www.openintro.org/book/os/", "Openly licensed statistics textbook for practising the concepts named in the study sequence.", "learning"),
  powerbi: resource("power-bi-learn", "Microsoft Power BI learning paths", "https://learn.microsoft.com/en-us/training/powerplatform/power-bi", "Official reporting-tool training; module availability and naming change over time.", "course"),
  spreadsheet: resource("sheets-training", "Google Sheets training and help", "https://support.google.com/a/users/answer/9282959", "Official spreadsheet training material for practising the analysis steps described.", "learning"),
  writing: resource("plain-language", "Plain language guidelines", "https://www.plainlanguage.gov/guidelines/", "Public guidance on clear writing, used for practising written communication."),
  interviewing: resource("onet-interview", "O*NET interest profiler", "https://www.mynextmove.org/explore/ip", "A self-directed interest questionnaire for exploring directions; it is not an aptitude test or a suitability verdict.", "career"),
  apprentice: resource("apprenticeship-india", "Ministry of Skill Development and Entrepreneurship", "https://www.msde.gov.in/", "India's official skills ministry portal for locating recognised training routes. Verify individual schemes on their own pages.", "career"),
  ilo: resource("ilo-careers", "International Labour Organization: skills and employability", "https://www.ilo.org/topics/skills-knowledge-and-employability", "International labour-policy material for background on skills and work; it makes no claim about an individual application."),
  wellbeing: resource("who-workplace", "WHO: mental health at work", "https://www.who.int/teams/mental-health-and-substance-use/promotion-prevention/mental-health-in-the-workplace", "Public-health guidance on workplace wellbeing; it is general information, not clinical or legal advice."),
  a11y: resource("wcag-quickref", "How to meet WCAG (Quick Reference)", "https://www.w3.org/WAI/WCAG22/quickref/", "Accessibility success criteria used as a checklist when practising inclusive interface work."),
  freelance: resource("eu-freelance", "European Commission: starting a business", "https://europa.eu/youreurope/business/running-business/start-ups/starting-business/index_en.htm", "Public information about setting up independent work in the EU; rules differ by country and must be checked locally."),

  // --- Expansion catalogue (all URLs fetched with HTTP 200 on the checkedExpansion date) ---
  // Python and backend
  fastapi: official("fastapi-docs", "FastAPI", "FastAPI documentation", "https://fastapi.tiangolo.com/", "Official FastAPI docs: a tutorial-first guide to building typed Python APIs with automatic validation and OpenAPI docs."),
  django: official("django-docs", "Django Software Foundation", "Django documentation", "https://docs.djangoproject.com/en/stable/", "Official Django docs including the step-by-step tutorial, ORM, forms, authentication and deployment guides."),
  flask: official("flask-docs", "Pallets", "Flask documentation", "https://flask.palletsprojects.com/", "Official Flask docs for lightweight Python web services; useful for understanding request handling before larger frameworks."),
  automate: learning("automate-boring-stuff", "Al Sweigart", "Automate the Boring Stuff with Python", "https://automatetheboringstuff.com/", "A free practical Python book focused on scripting everyday tasks; good for building fluency through small useful programs."),
  pythonAlgorithms: github("thealgorithms-python", "TheAlgorithms", "TheAlgorithms/Python", "https://github.com/TheAlgorithms/Python", "Community implementations of classic algorithms in Python; read implementations after attempting them yourself."),
  awesomePython: github("awesome-python", "vinta", "Awesome Python", "https://github.com/vinta/awesome-python", "A curated index of Python libraries by category; use it to discover tools, not as a study order."),
  // Java
  javaLearn: official("dev-java-learn", "Oracle", "Learn Java (dev.java)", "https://dev.java/learn/", "Oracle's official modern Java learning path covering language basics through the standard library."),
  javaTutorials: official("java-tutorials", "Oracle", "The Java Tutorials", "https://docs.oracle.com/javase/tutorial/", "The long-standing official Java tutorials; detailed reference for language features and core APIs."),
  springGuides: official("spring-guides", "VMware / Spring", "Spring Guides", "https://spring.io/guides", "Official short, hands-on Spring guides for building REST services, data access and security."),
  springBoot: official("spring-boot-docs", "VMware / Spring", "Spring Boot reference", "https://docs.spring.io/spring-boot/", "Official Spring Boot reference documentation for configuration, starters and production features."),
  awesomeJava: github("awesome-java", "akullpp", "Awesome Java", "https://github.com/akullpp/awesome-java", "A curated list of Java frameworks, libraries and tooling by category."),
  // JavaScript, TypeScript, frontend
  typescript: official("typescript-handbook", "Microsoft", "TypeScript Handbook", "https://www.typescriptlang.org/docs/handbook/intro.html", "The official TypeScript handbook: types, interfaces, generics, narrowing and modules."),
  javascriptInfo: learning("javascript-info", "javascript.info", "The Modern JavaScript Tutorial", "https://javascript.info/", "A thorough free JavaScript tutorial from basics to browser APIs, widely used for structured self-study."),
  eloquentJs: learning("eloquent-javascript", "Marijn Haverbeke", "Eloquent JavaScript", "https://eloquentjavascript.net/", "A free book that teaches JavaScript with exercises and small projects; strong on program design."),
  nextjs: official("nextjs-docs", "Vercel", "Next.js documentation", "https://nextjs.org/docs", "Official Next.js docs covering routing, data fetching, rendering modes and deployment."),
  webDev: official("web-dev-learn", "Google", "web.dev Learn", "https://web.dev/learn", "Google's structured courses on HTML, CSS, performance, accessibility and web fundamentals."),
  nodeLearn: official("node-learn", "OpenJS Foundation", "Node.js Learn", "https://nodejs.org/en/learn", "Official Node.js learning material covering the runtime, modules, asynchronous patterns and the ecosystem."),
  nodeBestPractices: github("node-best-practices", "goldbergyoni", "Node.js Best Practices", "https://github.com/goldbergyoni/nodebestpractices", "A community-maintained list of Node.js project, error-handling, security and testing practices."),
  fullstackOpen: course("fullstack-open", "University of Helsinki", "Full Stack Open", "https://fullstackopen.com/en/", "A free university course on modern full-stack development with React, Node, databases, TypeScript and testing."),
  odin: course("odin-project", "The Odin Project", "The Odin Project", "https://www.theodinproject.com/", "A free, project-based full-stack curriculum with a strong emphasis on building things independently."),
  freecodecamp: course("freecodecamp-learn", "freeCodeCamp", "freeCodeCamp curriculum", "https://www.freecodecamp.org/learn", "Free interactive certifications covering web development, JavaScript, Python, data analysis and more."),
  webDevBeginners: github("web-dev-for-beginners", "Microsoft", "Web Development for Beginners", "https://github.com/microsoft/Web-Dev-For-Beginners", "A 12-week open curriculum from Microsoft on HTML, CSS and JavaScript fundamentals with projects."),
  smashing: article("smashing-magazine", "Smashing Magazine", "Smashing Magazine", "https://www.smashingmagazine.com/", "Long-running articles on front-end engineering, UX and accessibility written by practitioners."),
  // Computer science, algorithms, interviews
  ossu: github("ossu-cs", "Open Source Society University", "OSSU Computer Science", "https://github.com/ossu/computer-science", "A free, self-taught computer science curriculum assembled from university-level open courses."),
  cs50: course("cs50x", "Harvard University", "CS50's Introduction to Computer Science", "https://cs50.harvard.edu/x/", "Harvard's free introductory computer science course; a rigorous foundation for any programming career."),
  mitOcw: course("mit-ocw", "MIT", "MIT OpenCourseWare", "https://ocw.mit.edu/", "Free MIT course materials across computer science, mathematics, management and more."),
  systemDesignPrimer: github("system-design-primer", "donnemartin", "System Design Primer", "https://github.com/donnemartin/system-design-primer", "A widely used open reference for learning how to design large-scale systems and prepare for design interviews."),
  systemDesign101: github("system-design-101", "ByteByteGo", "System Design 101", "https://github.com/ByteByteGoHq/system-design-101", "Visual explanations of common system design concepts and architectures."),
  codingInterviewUniversity: github("coding-interview-university", "jwasham", "Coding Interview University", "https://github.com/jwasham/coding-interview-university", "A well-known self-study plan for computer science fundamentals and coding interviews."),
  techInterviewHandbook: github("tech-interview-handbook", "yangshun", "Tech Interview Handbook", "https://github.com/yangshun/tech-interview-handbook", "Free curated guidance on algorithms, behavioural questions, résumés and negotiation for software interviews."),
  neetcode: learning("neetcode", "NeetCode", "NeetCode", "https://neetcode.io/", "Structured coding-problem roadmaps with video explanations, organised by pattern."),
  hackerrank: learning("hackerrank", "HackerRank", "HackerRank", "https://www.hackerrank.com/", "Practice problems across languages, SQL and problem-solving domains; many employers use it for screening."),
  cpAlgorithms: learning("cp-algorithms", "cp-algorithms", "Algorithms for Competitive Programming", "https://cp-algorithms.com/", "Detailed algorithm explanations with implementations; a reference for going deeper than interview basics."),
  projectBasedLearning: github("project-based-learning", "practical-tutorials", "Project Based Learning", "https://github.com/practical-tutorials/project-based-learning", "Curated tutorials for building real projects in many languages; ideal for moving past exercises."),
  appIdeas: github("app-ideas", "florinpop17", "App Ideas Collection", "https://github.com/florinpop17/app-ideas", "Portfolio project ideas graded by difficulty with user stories and bonus features."),
  awesomeForBeginners: github("awesome-for-beginners", "MunGell", "Awesome for Beginners", "https://github.com/MunGell/awesome-for-beginners", "Open-source projects that label beginner-friendly issues, organised by language."),
  refactoringGuru: learning("refactoring-guru", "Refactoring.Guru", "Refactoring and design patterns", "https://refactoring.guru/", "Illustrated explanations of code smells, refactoring techniques and design patterns."),
  martinFowler: article("martin-fowler", "Martin Fowler", "martinfowler.com", "https://martinfowler.com/", "Essays on software architecture, refactoring, testing and delivery practice."),
  twelveFactor: article("twelve-factor", "Heroku", "The Twelve-Factor App", "https://12factor.net/", "A concise methodology for building deployable, scalable web services; useful vocabulary for backend and DevOps interviews."),
  learnXinY: learning("learn-x-in-y", "Learn X in Y minutes", "Learn X in Y minutes", "https://learnxinyminutes.com/", "Quick syntax tours of many languages; useful when moving between languages, not for learning fundamentals."),
  // Data
  pandas: official("pandas-user-guide", "pandas", "pandas user guide", "https://pandas.pydata.org/docs/user_guide/index.html", "Official pandas documentation for loading, cleaning, reshaping and aggregating tabular data."),
  numpy: official("numpy-learn", "NumPy", "NumPy Learn", "https://numpy.org/learn/", "Official NumPy learning resources for array computing fundamentals."),
  kaggleLearn: course("kaggle-learn", "Kaggle", "Kaggle Learn", "https://www.kaggle.com/learn", "Short free hands-on courses on Python, pandas, SQL, machine learning and data visualisation with practice notebooks."),
  sqlbolt: learning("sqlbolt", "SQLBolt", "SQLBolt", "https://sqlbolt.com/", "Interactive SQL lessons from basic SELECTs through joins and aggregation."),
  modeSql: learning("mode-sql-tutorial", "Mode", "Mode SQL Tutorial", "https://mode.com/sql-tutorial/", "A free SQL tutorial oriented towards analysts, from basics to window functions."),
  googleDataAnalytics: course("google-data-analytics", "Google / Coursera", "Google Data Analytics Professional Certificate", "https://www.coursera.org/professional-certificates/google-data-analytics", "A beginner data analytics programme covering spreadsheets, SQL, R/Tableau basics and a capstone. Check current pricing and audit options on the page."),
  dataScienceBeginners: github("data-science-for-beginners", "Microsoft", "Data Science for Beginners", "https://github.com/microsoft/Data-Science-For-Beginners", "A 10-week open curriculum on data science fundamentals with lessons, quizzes and assignments."),
  awesomeDataScience: github("awesome-datascience", "academic", "Awesome Data Science", "https://github.com/academic/awesome-datascience", "A curated collection of data science learning resources, datasets and tools."),
  tableauTraining: official("tableau-training", "Tableau", "Tableau training", "https://www.tableau.com/learn/training", "Official Tableau training videos and learning paths for building visualisations and dashboards."),
  excelEasy: learning("excel-easy", "Excel Easy", "Excel Easy", "https://www.excel-easy.com/", "A free, example-driven Excel tutorial covering formulas, functions, data analysis and VBA basics."),
  excelSupport: official("excel-support", "Microsoft", "Microsoft Excel help and learning", "https://support.microsoft.com/en-us/excel", "Official Excel documentation and training for functions, tables, PivotTables and charts."),
  statLearning: learning("islr", "James, Witten, Hastie, Tibshirani", "An Introduction to Statistical Learning", "https://www.statlearning.com/", "A free foundational textbook on statistical learning methods with Python and R labs."),
  spark: official("spark-docs", "Apache Software Foundation", "Apache Spark documentation", "https://spark.apache.org/docs/latest/", "Official documentation for distributed data processing with Spark."),
  airflow: official("airflow-docs", "Apache Software Foundation", "Apache Airflow documentation", "https://airflow.apache.org/docs/", "Official documentation for orchestrating data pipelines with Airflow."),
  // AI, ML, generative AI
  sklearn: official("scikit-learn-guide", "scikit-learn", "scikit-learn user guide", "https://scikit-learn.org/stable/user_guide.html", "Official guide to classical machine learning algorithms, model selection and evaluation in Python."),
  pytorch: official("pytorch-tutorials", "PyTorch Foundation", "PyTorch tutorials", "https://pytorch.org/tutorials/", "Official PyTorch tutorials from tensors to training and deploying neural networks."),
  tensorflow: official("tensorflow-tutorials", "Google", "TensorFlow tutorials", "https://www.tensorflow.org/tutorials", "Official TensorFlow/Keras tutorials for building and training models."),
  mlSpecialization: course("ml-specialization", "DeepLearning.AI / Stanford", "Machine Learning Specialization", "https://www.coursera.org/specializations/machine-learning-introduction", "Andrew Ng's foundational machine learning courses on Coursera. Check audit and pricing options on the page."),
  fastai: course("fastai-course", "fast.ai", "Practical Deep Learning for Coders", "https://course.fast.ai/", "A free, code-first deep learning course that starts from working models and explains the theory afterwards."),
  d2l: learning("dive-into-deep-learning", "d2l.ai", "Dive into Deep Learning", "https://d2l.ai/", "A free interactive deep learning textbook with runnable code in multiple frameworks."),
  mlForBeginners: github("ml-for-beginners", "Microsoft", "ML for Beginners", "https://github.com/microsoft/ML-For-Beginners", "A 12-week open curriculum on classical machine learning with lessons and quizzes."),
  aiForBeginners: github("ai-for-beginners", "Microsoft", "AI for Beginners", "https://github.com/microsoft/AI-For-Beginners", "A 12-week open curriculum spanning symbolic AI, neural networks, computer vision and NLP."),
  hundredDaysMl: github("100-days-of-ml", "Avik-Jain", "100 Days of ML Code", "https://github.com/Avik-Jain/100-Days-Of-ML-Code", "A day-by-day machine learning study log with code; useful as a pacing template."),
  appliedMl: github("applied-ml", "eugeneyan", "Applied ML", "https://github.com/eugeneyan/applied-ml", "Curated papers and blog posts describing how companies apply machine learning in production."),
  hfLearn: course("huggingface-learn", "Hugging Face", "Hugging Face Learn", "https://huggingface.co/learn", "Free courses on transformers, NLP, LLMs, agents and fine-tuning with open models."),
  transformers: official("transformers-docs", "Hugging Face", "Transformers documentation", "https://huggingface.co/docs/transformers/index", "Official documentation for loading, fine-tuning and serving transformer models."),
  smolCourse: github("smol-course", "Hugging Face", "smol-course", "https://github.com/huggingface/smol-course", "A practical course on aligning and fine-tuning small language models."),
  genaiBeginners: github("generative-ai-for-beginners", "Microsoft", "Generative AI for Beginners", "https://github.com/microsoft/generative-ai-for-beginners", "An open multi-lesson course on building generative AI applications, from prompts to RAG and agents."),
  llmsFromScratch: github("llms-from-scratch", "rasbt", "Build a Large Language Model (From Scratch)", "https://github.com/rasbt/LLMs-from-scratch", "Code and notebooks for implementing a GPT-style model step by step; the deepest way to understand LLM internals."),
  llmCourse: github("llm-course", "mlabonne", "LLM Course", "https://github.com/mlabonne/llm-course", "A roadmap with notebooks covering LLM fundamentals, fine-tuning and deployment for engineers."),
  langchain: official("langchain-docs", "LangChain", "LangChain documentation", "https://python.langchain.com/docs/introduction/", "Official documentation for building LLM applications, chains, retrieval and agents in Python."),
  llamaindex: official("llamaindex-docs", "LlamaIndex", "LlamaIndex documentation", "https://docs.llamaindex.ai/en/stable/", "Official documentation for retrieval-augmented generation over your own data."),
  openaiDocs: official("openai-platform-docs", "OpenAI", "OpenAI platform documentation", "https://platform.openai.com/docs", "Official API documentation for building with OpenAI models, tools and embeddings."),
  claudeDocs: official("claude-platform-docs", "Anthropic", "Claude platform documentation", "https://docs.claude.com/", "Official documentation for building with Claude models, tool use, prompt design and agent patterns."),
  openaiCookbook: github("openai-cookbook", "OpenAI", "OpenAI Cookbook", "https://github.com/openai/openai-cookbook", "Example notebooks for common LLM application patterns: embeddings, retrieval, function calling and evaluation."),
  promptingGuide: learning("prompting-guide", "DAIR.AI", "Prompt Engineering Guide", "https://www.promptingguide.ai/", "A free guide to prompting techniques, model capabilities and safety considerations."),
  promptGuideRepo: github("prompt-engineering-guide-repo", "DAIR.AI", "Prompt-Engineering-Guide", "https://github.com/dair-ai/Prompt-Engineering-Guide", "The source repository and papers list behind the Prompt Engineering Guide."),
  dlaiShortCourses: course("deeplearning-ai-short-courses", "DeepLearning.AI", "DeepLearning.AI short courses", "https://www.deeplearning.ai/short-courses/", "Short, free-to-audit courses on LLM application patterns, RAG, agents, evaluation and fine-tuning."),
  // DevOps, cloud
  kubernetesTutorials: official("kubernetes-tutorials", "CNCF", "Kubernetes tutorials", "https://kubernetes.io/docs/tutorials/", "Official hands-on Kubernetes tutorials including the interactive basics module."),
  terraform: official("terraform-tutorials", "HashiCorp", "Terraform tutorials", "https://developer.hashicorp.com/terraform/tutorials", "Official infrastructure-as-code tutorials for AWS, Azure, Google Cloud and more."),
  githubActions: official("github-actions-docs", "GitHub", "GitHub Actions documentation", "https://docs.github.com/en/actions", "Official documentation for building CI/CD workflows with GitHub Actions."),
  awsTraining: official("aws-training", "Amazon Web Services", "AWS Training and Certification", "https://aws.amazon.com/training/", "Official AWS learning paths, digital training and certification information."),
  awsSkillBuilder: official("aws-skill-builder", "Amazon Web Services", "AWS Skill Builder", "https://skillbuilder.aws/", "AWS's own learning platform with free foundational courses and labs; some content requires a subscription."),
  azureTraining: official("azure-training", "Microsoft", "Microsoft Learn: Azure training", "https://learn.microsoft.com/en-us/training/azure/", "Free official Azure learning paths and modules with sandboxes."),
  gcpLearn: official("google-cloud-learn", "Google Cloud", "Google Cloud learning", "https://cloud.google.com/learn", "Official Google Cloud courses, learning paths and certification information."),
  cloudSkillsBoost: official("cloud-skills-boost", "Google Cloud", "Google Cloud Skills Boost", "https://www.cloudskillsboost.google/", "Google Cloud's hands-on lab platform; some labs are free, others need credits."),
  devopsRoadmapRepo: github("devops-roadmap-repo", "milanm", "DevOps Roadmap", "https://github.com/milanm/DevOps-Roadmap", "An annotated DevOps learning roadmap with linked resources per topic."),
  devopsExercises: github("devops-exercises", "bregman-arie", "DevOps Exercises", "https://github.com/bregman-arie/devops-exercises", "Thousands of practice questions across Linux, networking, containers, CI/CD and cloud; useful for interview preparation."),
  sreBooks: article("google-sre-books", "Google", "Google SRE books", "https://sre.google/books/", "Google's free Site Reliability Engineering books on running production systems."),
  gitlabDevops: article("gitlab-what-is-devops", "GitLab", "What is DevOps?", "https://about.gitlab.com/topics/devops/", "An explanatory overview of DevOps practices, culture and tooling."),
  developerRoadmap: github("developer-roadmap", "kamranahmedse", "Developer Roadmaps (roadmap.sh)", "https://roadmap.sh/", "Community-maintained visual roadmaps for frontend, backend, DevOps, AI engineering, data and many other roles."),
  // Security
  owaspTop10: official("owasp-top-ten", "OWASP", "OWASP Top Ten", "https://owasp.org/www-project-top-ten/", "The standard awareness document for the most critical web application security risks."),
  owaspCheatSheets: official("owasp-cheat-sheets", "OWASP", "OWASP Cheat Sheet Series", "https://cheatsheetseries.owasp.org/", "Concise, practical guidance on specific application security topics for developers and testers."),
  portswigger: learning("portswigger-academy", "PortSwigger", "Web Security Academy", "https://portswigger.net/web-security", "A free, lab-based web security training platform from the makers of Burp Suite."),
  tryhackme: learning("tryhackme", "TryHackMe", "TryHackMe", "https://tryhackme.com/", "Guided, browser-based security learning paths and labs; a free tier exists alongside paid content."),
  hackthebox: learning("hackthebox", "Hack The Box", "Hack The Box", "https://www.hackthebox.com/", "Hands-on penetration testing labs and learning paths; practise only within its authorised environments."),
  comptiaSecurity: official("comptia-security-plus", "CompTIA", "CompTIA Security+", "https://www.comptia.org/certifications/security", "Official page for the entry-level security certification; check current exam objectives and fees there."),
  isc2: official("isc2", "ISC2", "ISC2", "https://www.isc2.org/", "The professional body behind CISSP and the entry-level Certified in Cybersecurity credential."),
  awesomeSecurity: github("awesome-security", "sbilly", "Awesome Security", "https://github.com/sbilly/awesome-security", "A curated list of security tools, resources and learning material."),
  // QA
  selenium: official("selenium-docs", "Selenium", "Selenium documentation", "https://www.selenium.dev/documentation/", "Official Selenium WebDriver documentation for browser automation."),
  istqb: official("istqb", "ISTQB", "ISTQB", "https://www.istqb.org/", "The international software testing qualifications board; syllabi are free to download."),
  pytest: official("pytest-docs", "pytest", "pytest documentation", "https://docs.pytest.org/en/stable/", "Official documentation for Python's most widely used test framework."),
  jest: official("jest-docs", "Meta / OpenJS", "Jest documentation", "https://jestjs.io/docs/getting-started", "Official documentation for JavaScript unit testing with Jest."),
  testAutomationU: course("test-automation-university", "Applitools", "Test Automation University", "https://testautomationu.applitools.com/", "Free courses on test automation frameworks, languages and practices taught by practitioners."),
  postmanLearning: official("postman-learning", "Postman", "Postman Learning Center", "https://learning.postman.com/", "Official guides for API exploration, testing and collections."),
  // UX, design
  nngroup: article("nngroup-articles", "Nielsen Norman Group", "Nielsen Norman Group articles", "https://www.nngroup.com/articles/", "Research-based UX articles on usability, research methods and interface design."),
  hig: official("apple-hig", "Apple", "Human Interface Guidelines", "https://developer.apple.com/design/human-interface-guidelines", "Apple's official platform design guidance."),
  material: official("material-design", "Google", "Material Design 3", "https://m3.material.io/", "Google's open design system with components, guidelines and accessibility guidance."),
  figmaHelp: official("figma-help", "Figma", "Figma Help Center", "https://help.figma.com/", "Official Figma documentation and tutorials for the design tool most job descriptions name."),
  figmaLibrary: learning("figma-resource-library", "Figma", "Figma resource library", "https://www.figma.com/resource-library/", "Figma's guides on design process, UX basics and collaboration."),
  lawsOfUx: learning("laws-of-ux", "Jon Yablonski", "Laws of UX", "https://lawsofux.com/", "Short explanations of the psychology principles designers apply to interfaces."),
  ixdf: learning("interaction-design-foundation", "Interaction Design Foundation", "IxDF literature", "https://www.interaction-design.org/literature", "Open-access articles and encyclopedia chapters on UX and interaction design."),
  designResources: github("design-resources-for-developers", "bradtraversy", "Design resources for developers", "https://github.com/bradtraversy/design-resources-for-developers", "A curated list of free design assets, tools, fonts, icons and inspiration."),
  alistapart: article("a-list-apart", "A List Apart", "A List Apart", "https://alistapart.com/", "Essays on web design, content strategy and front-end practice."),
  // Product, business analysis, agile
  svpg: article("svpg-articles", "Silicon Valley Product Group", "SVPG articles", "https://www.svpg.com/articles/", "Marty Cagan's articles on product discovery, empowered teams and product leadership."),
  productplan: learning("productplan-learn", "ProductPlan", "ProductPlan learning center", "https://www.productplan.com/learn/", "Glossary-style explanations of product management concepts, roadmaps and prioritisation frameworks."),
  scrumGuide: official("scrum-guide", "Scrum.org / Scrum Alliance", "The Scrum Guide", "https://scrumguides.org/", "The official definition of Scrum; short and free."),
  iiba: official("iiba", "IIBA", "International Institute of Business Analysis", "https://www.iiba.org/", "The professional body for business analysis; publishes the BABOK guide and certifications."),
  // Accounting, finance
  icai: official("icai", "ICAI", "Institute of Chartered Accountants of India", "https://www.icai.org/", "The statutory body for chartered accountancy in India; the only authoritative source for CA course structure, registration and exam rules."),
  icmai: official("icmai", "ICMAI", "Institute of Cost Accountants of India", "https://www.icmai.in/", "The statutory body for cost and management accountancy in India."),
  icsi: official("icsi", "ICSI", "Institute of Company Secretaries of India", "https://www.icsi.edu/", "The statutory body for the company secretary profession in India."),
  acca: official("acca", "ACCA", "ACCA Global", "https://www.accaglobal.com/", "The Association of Chartered Certified Accountants; check its site for current qualification structure and exemptions."),
  ifrs: official("ifrs", "IFRS Foundation", "IFRS Foundation", "https://www.ifrs.org/", "The body that issues IFRS accounting standards; useful for understanding international reporting."),
  cfa: official("cfa-institute", "CFA Institute", "CFA Institute", "https://www.cfainstitute.org/", "The body behind the CFA programme; check current curriculum, registration and fees there."),
  khanFinance: course("khan-academy-finance", "Khan Academy", "Khan Academy: Finance and capital markets", "https://www.khanacademy.org/economics-finance-domain/core-finance", "Free video lessons on interest, accounting basics, stocks, bonds and valuation."),
  gst: official("gst-portal", "Government of India", "GST portal", "https://www.gst.gov.in/", "India's official goods and services tax portal; the authority on filing procedures."),
  incomeTax: official("income-tax-india", "Government of India", "Income Tax Department", "https://www.incometax.gov.in/", "India's official income tax portal for current rules, forms and filing."),
  mca: official("mca-india", "Government of India", "Ministry of Corporate Affairs", "https://www.mca.gov.in/", "India's official corporate filings and company law portal."),
  sebi: official("sebi", "SEBI", "Securities and Exchange Board of India", "https://www.sebi.gov.in/", "India's securities regulator; authoritative for market regulation and investor education."),
  tally: official("tally", "Tally Solutions", "Tally Solutions", "https://www.tallysolutions.com/", "The accounting software many Indian small businesses use; its site hosts product learning material."),
  // Marketing
  skillshop: official("google-skillshop", "Google", "Google Skillshop", "https://skillshop.withgoogle.com/", "Free official training and certifications for Google Ads, Analytics and other Google marketing tools."),
  hubspotAcademy: course("hubspot-academy", "HubSpot", "HubSpot Academy", "https://academy.hubspot.com/", "Free courses and certifications on inbound marketing, content, email, SEO and CRM basics."),
  googleAnalyticsHelp: official("google-analytics-help", "Google", "Google Analytics Help", "https://support.google.com/analytics/", "Official documentation for measuring website and app traffic with Google Analytics."),
  mozSeo: learning("moz-beginners-guide-seo", "Moz", "Beginner's Guide to SEO", "https://moz.com/beginners-guide-to-seo", "A long-standing free introduction to how search engines work and how to optimise for them."),
  semrushAcademy: course("semrush-academy", "Semrush", "Semrush Academy", "https://www.semrush.com/academy/", "Free courses on SEO, content marketing, PPC and competitive research."),
  ahrefsBlog: article("ahrefs-blog", "Ahrefs", "Ahrefs blog", "https://ahrefs.com/blog/", "Data-driven articles and guides on SEO and content marketing."),
  backlinko: article("backlinko", "Backlinko", "Backlinko", "https://backlinko.com/", "Detailed SEO and content marketing guides."),
  googleAdsBlog: article("google-ads-blog", "Google", "Google Ads and Commerce blog", "https://blog.google/products/ads-commerce/", "Official announcements and updates about Google's advertising products."),
  // HR
  shrm: official("shrm", "SHRM", "Society for Human Resource Management", "https://www.shrm.org/", "A major HR professional body with resources, certifications and research; membership is paid."),
  cipd: official("cipd", "CIPD", "Chartered Institute of Personnel and Development", "https://www.cipd.org/", "The UK-based professional body for HR and people development; publishes free factsheets."),
  hrci: official("hrci", "HRCI", "HR Certification Institute", "https://www.hrci.org/", "Certification body for HR professionals; check current eligibility and fees there."),
  // Careers
  blsOoh: career("bls-ooh", "US Bureau of Labor Statistics", "Occupational Outlook Handbook", "https://www.bls.gov/ooh/", "US occupational descriptions covering what workers do, typical education and work environment. Salary figures are US-specific."),
  myNextMove: career("my-next-move", "US Department of Labor", "My Next Move", "https://www.mynextmove.org/", "Plain-language career exploration by interests and keywords."),
  growGoogle: course("grow-with-google", "Google", "Google Career Certificates", "https://grow.google/certificates/", "Google's entry-level certificate programmes in data analytics, UX design, project management, IT support, cybersecurity and digital marketing. Check current pricing and financial aid on the page."),
  googleHiring: career("google-how-we-hire", "Google", "How we hire at Google", "https://www.google.com/about/careers/applications/how-we-hire/", "One large employer's description of its own hiring process; a reference for what structured interviews look like, not a universal standard."),
  theMuse: article("the-muse-advice", "The Muse", "The Muse career advice", "https://www.themuse.com/advice", "Practical articles on job searching, interviewing and workplace situations."),
  linkedinTalentBlog: article("linkedin-talent-blog", "LinkedIn", "LinkedIn Talent Blog", "https://www.linkedin.com/business/talent/blog", "Articles written for recruiters; reading them shows candidates how hiring teams think."),
  udacity: course("udacity", "Udacity", "Udacity", "https://www.udacity.com/", "Paid project-based nanodegree programmes with some free courses; verify current catalogue and cost."),
  edx: course("edx", "edX", "edX", "https://www.edx.org/", "University courses that can usually be audited free, with paid certificates."),
  secretKnowledge: github("book-of-secret-knowledge", "trimstray", "The Book of Secret Knowledge", "https://github.com/trimstray/the-book-of-secret-knowledge", "A large curated list of tools and references for sysadmins, DevOps and security engineers."),
  awesomeScalability: github("awesome-scalability", "binhnguyennus", "Awesome Scalability", "https://github.com/binhnguyennus/awesome-scalability", "Curated readings on scalable, reliable and performant large-scale systems."),
} satisfies Record<string, TutorSource>;

export type SourceId = keyof typeof sources;

/**
 * One authored question. Alternates are extra phrasings of the same question and
 * are never counted as separate entries. Videos are registry IDs from videos.ts.
 */
export type Row = [
  id: string,
  question: string,
  alternates: string[],
  category: string,
  intent: string,
  answer: string,
  resources: SourceId[],
  keywords: string[],
  videos?: string[],
];

export const reviewNote = {
  method:
    "AI editorial review: original mentor recommendations; linked resources checked for scope",
  reviewer: "Codex",
  notes:
    "Not independently reviewed by a human career professional. No salary, hiring-probability, or eligibility guarantees.",
};

export const expansionReviewNote = {
  method:
    "AI editorial authoring (Claude, 2026-09-12): original mentor recommendations; every linked URL fetched with HTTP 200 and every video ID verified through YouTube oEmbed during authoring",
  reviewer: "Claude",
  notes:
    "Not independently reviewed by a human career professional. No salary, hiring-probability, fee or eligibility claims; certification and exam details must be confirmed with the provider.",
};

export function toEntries(rows: Row[], review = reviewNote): KnowledgeEntry[] {
  return rows.map(
    ([id, question, alternate_questions, category, intent, answer, resourceIds, keywords, videos = []]) => ({
      id,
      question,
      alternate_questions,
      answer,
      category,
      subcategory: id,
      keywords,
      experience_level: ["all"],
      career_role: [],
      education_level: [],
      country_or_region: ["global"],
      sources: resourceIds.map((resourceId) => sources[resourceId]),
      youtube_resources: videos.flatMap((videoId) => {
        const video = videoById(videoId);
        if (!video) throw new Error(`Unknown video ${videoId} on entry ${id}`);
        return [videoSource(video)];
      }),
      last_verified: review === reviewNote ? checked : checkedExpansion,
      confidence: 0.85,
      version: 1,
      status: "published" as const,
      intent,
      volatile: false,
      variants: {},
      review,
    }),
  );
}
