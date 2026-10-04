import Link from "next/link";
import { Brand, Icon, ThemeSwitch } from "@/components/ui";
import { WelcomePreview } from "@/components/welcome-preview";
import WelcomeReveal from "@/components/welcome-reveal";
import styles from "./welcome.module.css";
const questions = [
  {
    q: "Where does my content live?",
    a: "In your DigitalOcean Spaces. Each project has its own storage configuration. Articles, media, and metadata stay in object storage, with no database to manage.",
  },
  {
    q: "Can I work across several projects?",
    a: "Yes. After signing in, you choose from the projects you have access to. Each project has its own content and team permissions.",
  },
  {
    q: "What happens when I edit a published article?",
    a: "Your changes are saved as a private draft. Readers keep seeing the published version until you explicitly publish the update. Previous revisions are retained.",
  },
  {
    q: "Does my website have to use a particular design?",
    a: "No. The published-content API supplies the content. Your website decides how to render it. The developer guides include a complete Next.js integration example.",
  },
];
export default function Welcome() {
  return (
    <WelcomeReveal>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Welcome navigation">
          <Link href="#product">Product</Link>
          <Link href="#the-workflow">How it works</Link>
          <Link href="/developers">Developers</Link>
          <ThemeSwitch />
          <Link href="/login" className={styles.headerLogin}>
            Log in <Icon name="arrow" size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.accentDot} />
              YOUR CONTENT. YOUR STORAGE. YOUR NEXT IDEA.
            </div>
            <h1>
              <span>Create, manage, publish.</span>
              <span className={styles.headlineAccent}>
                Your content, connected.
              </span>
            </h1>
            <p>
              A focused workspace for articles, media, and dynamic content.
              Publish to any website, with your own DigitalOcean Spaces behind
              it.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/login">
                Log in to your workspace <Icon name="arrow" size={18} />
              </Link>
              <Link className={styles.secondary} href="#the-workflow">
                Explore the workflow <Icon name="arrow-down" size={16} />
              </Link>
            </div>
            <div className={styles.heroFacts}>
              <span>
                <Icon name="code" size={14} />
                Open source
              </span>
              <span>
                <Icon name="lock" size={14} />
                Private drafts
              </span>
              <span>
                <Icon name="globe" size={14} />
                Published-content API
              </span>
            </div>
          </div>
        </section>
        <section id="product" className={styles.product} data-reveal>
          <div className={styles.productCaption}>
            <span>ONE WORKSPACE. EVERY PIECE OF CONTENT.</span>
            <span>
              <Icon name="arrow-down" size={14} />
              Try the publishing preview
            </span>
          </div>
          <WelcomePreview />
          <div className={styles.productNote}>
            Fictional content. This demonstration does not save or publish real
            articles.
          </div>
        </section>
        <section id="the-workflow" className={styles.workflow} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>01 / FROM DRAFT TO DELIVERY</span>
            <h2>
              A clear path from idea
              <br />
              to published content.
            </h2>
            <p>
              Work privately. Refine the details. Decide when your readers see
              the result.
            </p>
          </div>
          <ol className={styles.steps}>
            {[
              {
                icon: "article",
                title: "Create a draft",
                text: "Write in Markdown. Add an author, article date, and searchable tags.",
                detail: "Private by default",
              },
              {
                icon: "image",
                title: "Prepare the details",
                text: "Bring in your media, check the preview, and configure search and social metadata.",
                detail: "Ready when you are",
              },
              {
                icon: "globe",
                title: "Publish with intent",
                text: "Release a finished version. Further edits stay private until you publish again.",
                detail: "Available through the API",
              },
            ].map((step, i) => (
              <li key={step.title}>
                <div className={styles.stepTop}>
                  <span className={styles.stepIcon}>
                    <Icon name={step.icon} size={23} />
                  </span>
                  <span>0{i + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className={styles.stepDetail}>
                  <Icon name="check" size={14} />
                  {step.detail}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section id="media" className={styles.capabilities} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>
              02 / BUILT FOR DYNAMIC WEBSITES
            </span>
            <h2>
              More than words.
              <br />
              Everything that brings them to life.
            </h2>
            <p>
              Keep your stories, assets, and structured content together without
              forcing your website into a template.
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            <article className={styles.capability}>
              <div className={styles.articleMini} aria-hidden="true">
                <div>
                  <span className={styles.miniLabel}>ARTICLE / DRAFT</span>
                  <Icon name="article" size={19} />
                </div>
                <strong>Behind the next idea</strong>
                <span>A little context makes a better story.</span>
                <div className={styles.miniLines}>
                  <i />
                  <i />
                  <i />
                </div>
                <div className={styles.miniTags}>
                  <span>Process</span>
                  <span>Ideas</span>
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <Icon name="article" />
                <h3>Articles that are ready for the web</h3>
                <p>
                  Markdown, searchable tags, editable dates, and SEO fields.
                  Draft and published versions stay separate.
                </p>
              </div>
            </article>
            <article className={styles.capability}>
              <div className={styles.mediaMini} aria-hidden="true">
                <div className={styles.assetOne}>
                  <Icon name="image" size={30} />
                  <span>studio-cover.jpg</span>
                </div>
                <div className={styles.assetTwo}>
                  <Icon name="play" size={28} />
                  <span>process-film.mp4</span>
                </div>
                <div className={styles.assetCaption}>
                  <Icon name="check" size={14} />
                  Originals + context, together
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <Icon name="image" />
                <h3>A library for images and video</h3>
                <p>
                  Keep private originals, alt text, captions, and JSON metadata.
                  Publish delivery copies of referenced assets.
                </p>
              </div>
            </article>
            <article className={styles.capability}>
              <div className={styles.jsonMini} aria-hidden="true">
                <span className={styles.miniLabel}>
                  DOCUMENT / HOMEPAGE-BANNER
                </span>
                <pre>
                  <code>
                    {
                      '{\n  "headline": "Something new",\n  "link": "/journal",\n  "visible": true\n}'
                    }
                  </code>
                </pre>
                <span className={styles.jsonStatus}>
                  <Icon name="check" size={13} />
                  Valid JSON
                </span>
              </div>
              <div className={styles.capabilityCopy}>
                <Icon name="code" />
                <h3>Content beyond the blog</h3>
                <p>
                  Named JSON documents for banners, navigation, or other dynamic
                  sections. Use the structure your website needs.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section id="connected" className={styles.connected} data-reveal>
          <div className={styles.integrationCopy}>
            <span className={styles.eyebrow}>03 / CONNECT TO YOUR WEBSITE</span>
            <h2>
              Your frontend.
              <br />
              Your content.
              <br />
              <span>One connection.</span>
            </h2>
            <p>
              Fetch published articles and JSON documents through the public
              API. Keep your own design, routes, and reading experience.
            </p>
            <Link className={styles.secondary} href="/developers">
              Read developer guides <Icon name="arrow" size={17} />
            </Link>
          </div>
          <div className={styles.integrationVisual}>
            <div className={styles.flowNodes}>
              <div>
                <Icon name="article" size={22} />
                <strong>Postparticle</strong>
                <span>Published content</span>
              </div>
              <span className={styles.flowLine} aria-hidden="true">
                <i />
              </span>
              <div>
                <Icon name="code" size={22} />
                <strong>Public API</strong>
                <span>Articles + JSON</span>
              </div>
              <span className={styles.flowLine} aria-hidden="true">
                <i />
              </span>
              <div>
                <Icon name="globe" size={22} />
                <strong>Your website</strong>
                <span>Your experience</span>
              </div>
            </div>
            <div className={styles.apiRequest}>
              <span>GET</span>
              <code>/api/v1/projects/demo/articles</code>
              <Icon name="check" size={16} />
            </div>
            <div className={styles.websitePreview}>
              <div>
                <span className={styles.miniLabel}>DEMO WEBSITE / JOURNAL</span>
                <span>Latest stories</span>
              </div>
              <h3>A new perspective</h3>
              <p>The published version, rendered in your own design.</p>
              <span>Articles · Tags · SEO metadata</span>
            </div>
          </div>
        </section>
        <section id="access" className={styles.access} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>
              04 / YOUR PROJECTS, UNDER CONTROL
            </span>
            <h2>
              The right access.
              <br />A place for every project.
            </h2>
            <p>
              One application for your team. Separate content and storage
              configuration for each project.
            </p>
          </div>
          <div className={styles.accessGrid}>
            <article>
              <span className={styles.accessIcon}>
                <Icon name="users" size={24} />
              </span>
              <h3>A workspace for your team</h3>
              <p>
                After login, people choose only from projects they can access.
                Admin, editor, and viewer roles keep responsibilities clear.
              </p>
              <div className={styles.roleList}>
                <span>Admin</span>
                <span>Editor</span>
                <span>Viewer</span>
              </div>
            </article>
            <article>
              <span className={styles.accessIcon}>
                <Icon name="lock" size={24} />
              </span>
              <h3>Your storage, project by project</h3>
              <p>
                Content lives in your DigitalOcean Spaces. Drafts and originals
                stay private; published content has its own delivery boundary.
              </p>
              <div className={styles.storageList}>
                <span>
                  <Icon name="check" size={14} />
                  Server-only credentials
                </span>
                <span>
                  <Icon name="check" size={14} />
                  No database required
                </span>
              </div>
            </article>
          </div>
        </section>
        <section className={styles.questions} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>A FEW PRACTICAL DETAILS</span>
            <h2>Before you get started.</h2>
          </div>
          <div>
            {questions.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <Icon name="plus" size={20} />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.closing} data-reveal>
          <div className={styles.closingGraphic} aria-hidden="true">
            <Icon name="article" size={58} />
          </div>
          <span className={styles.eyebrow}>
            FROM YOUR NEXT IDEA TO YOUR NEXT RELEASE
          </span>
          <h2>
            Make room for
            <br />
            <span>what comes next.</span>
          </h2>
          <p>Manage the content. Keep control of the experience.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/login">
              Log in to Postparticle <Icon name="arrow" size={18} />
            </Link>
            <Link className={styles.secondary} href="/developers">
              Read developer guides <Icon name="code" size={17} />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <span>Open source. Your storage. Your content.</span>
        <Link className={styles.developerFooterLink} href="/developers">
          Developer guides <Icon name="arrow-up-right" size={14} />
        </Link>
      </footer>
    </WelcomeReveal>
  );
}
