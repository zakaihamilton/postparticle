import Link from "next/link";
import Image from "next/image";
import { Brand, Icon, ThemeSwitch } from "@/components/ui";
import { WelcomePreview } from "@/components/welcome-preview";
import WelcomeReveal from "@/components/welcome-reveal";
import styles from "./welcome.module.css";
const questions = [
  {
    q: "Where does my content live?",
    a: "Your content lives in S3-compatible object storage. Projects share one content Space, with each project's articles, media, and metadata stored under a separate key prefix. Team access is managed per project. No database to manage.",
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
          <a href="#the-workflow">How it works</a>
          <Link href="/developers">Developers</Link>
          <ThemeSwitch />
          <Link href="/login" className={styles.headerLogin}>
            Log in <Icon name="arrow" size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.accentDot} />A HOME FOR YOUR CONTENT
              </div>
              <h1>
                Manage your website’s{" "}
                <span className={styles.headlineAccent}>content.</span>
              </h1>
              <p>
                A quiet workspace for articles, media, and the details that
                matter. Write privately. Publish when you’re ready.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primary} href="/login">
                  Log in to your workspace <Icon name="arrow" size={18} />
                </Link>
                <a className={styles.secondary} href="#the-workflow">
                  Explore the workflow <Icon name="arrow-down" size={16} />
                </a>
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
            <section id="product" className={styles.product} data-reveal>
              <div className={styles.productCaption}>
                <span>YOUR PUBLISHING WORKSPACE</span>
                <span>
                  <Icon name="arrow-down" size={14} />
                  Try the publishing preview
                </span>
              </div>
              <WelcomePreview />
              <div className={styles.productNote}>
                Fictional content. This demonstration does not save or publish
                real articles.
              </div>
            </section>
          </div>
        </section>
        <section id="the-workflow" className={styles.workflow} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>01 / FROM DRAFT TO DELIVERY</span>
            <h2>
              Write privately.
              <br />
              Publish when ready.
            </h2>
            <p>
              Draft changes stay private. Your website receives a new version
              only when you publish.
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
                detail: "Media and SEO checked",
              },
              {
                icon: "globe",
                title: "Publish the version",
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
            <span className={styles.eyebrow}>CONTENT LIBRARY</span>
            <h2>Articles, images, and video.</h2>
          </div>
          <div className={styles.contentRow}>
            <div className={styles.editorialGallery}>
              <figure className={styles.featurePhoto}>
                <Image
                  src="/images/welcome/architecture-editorial.webp"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 720px) 90vw, 50vw"
                  alt="Olive tree and afternoon shadows in a limestone courtyard"
                />
                <figcaption>
                  <span>ARTICLE COVER</span>
                  <strong>Light, stone, and open space</strong>
                </figcaption>
              </figure>
              <div className={styles.photoPair}>
                <figure>
                  <Image
                    src="/images/welcome/studio-editorial.webp"
                    width={1536}
                    height={1024}
                    sizes="(max-width: 720px) 44vw, 25vw"
                    alt="Paper proofs, linen-bound books, and pencils on a sunlit editor’s desk"
                  />
                  <figcaption>studio-notes.jpg</figcaption>
                </figure>
                <figure>
                  <Image
                    src="/images/welcome/coast-editorial.webp"
                    width={1536}
                    height={1024}
                    sizes="(max-width: 720px) 44vw, 25vw"
                    alt="Rocky coastline and quiet blue sea"
                  />
                  <figcaption>
                    <Icon name="play" size={16} /> coastal-film.mp4{" "}
                    <span>Sample cover</span>
                  </figcaption>
                </figure>
              </div>
            </div>
            <div className={styles.contentCopy}>
              <Icon name="image" size={28} />
              <h3>
                Write the article.
                <br />
                Keep the assets with it.
              </h3>
              <p>
                Markdown articles with tags, dates, and SEO fields. Images and
                video with alt text, captions, and metadata.
              </p>
              <p>
                Original files remain private. Referenced media gets a delivery
                copy when you publish.
              </p>
              <div className={styles.previewTags}>
                <span>Architecture</span>
                <span>Studio</span>
                <span>Travel</span>
              </div>
            </div>
          </div>
          <div className={styles.contentRow}>
            <div className={styles.contentCopy}>
              <Icon name="code" size={28} />
              <h3>Update more than the blog.</h3>
              <p>
                Store banners, navigation, and other website content as named
                JSON documents. Choose the structure your frontend needs.
              </p>
              <p>
                Save a draft, check the JSON, then publish it through the same
                API.
              </p>
            </div>
            <div className={styles.jsonMini}>
              <span className={styles.miniLabel}>
                DOCUMENT / HOMEPAGE-BANNER
              </span>
              <pre>
                <code>
                  {
                    '{\n  "headline": "Studio open days",\n  "link": "/visit",\n  "visible": true\n}'
                  }
                </code>
              </pre>
              <span className={styles.jsonStatus}>
                <Icon name="check" size={16} />
                Valid JSON · Draft saved
              </span>
            </div>
          </div>
        </section>
        <section id="connected" className={styles.connected} data-reveal>
          <div className={styles.integrationCopy}>
            <span className={styles.eyebrow}>WEBSITE INTEGRATION</span>
            <h2>Fetch published content on your website.</h2>
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
              <Image
                src="/images/welcome/architecture-editorial.webp"
                width={1536}
                height={1024}
                sizes="(max-width: 720px) 80vw, 40vw"
                alt=""
              />
              <h3>Light, stone, and open space</h3>
              <p>The published version, rendered in your own design.</p>
              <span>Articles · Tags · SEO metadata</span>
            </div>
          </div>
        </section>
        <section id="access" className={styles.access} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>PROJECTS AND STORAGE</span>
            <h2>
              Separate projects.
              <br />
              Controlled access.
            </h2>
            <p>
              After login, choose only from projects you can access. Each
              project has its own content and team roles. Project data is stored
              under a separate prefix in the shared content Space.
            </p>
          </div>
          <div className={styles.accessDetails}>
            <div>
              <Icon name="users" size={26} />
              <h3>Give your team the right access.</h3>
              <p>
                Admins manage membership, editors write and publish, and viewers
                have read-only access.
              </p>
              <div className={styles.roleList}>
                <span>Admin</span>
                <span>Editor</span>
                <span>Viewer</span>
              </div>
            </div>
            <div>
              <Icon name="lock" size={26} />
              <h3>Keep storage under your control.</h3>
              <p>
                Drafts and originals stay private. Spaces credentials remain on
                the server. No database required.
              </p>
            </div>
          </div>
        </section>
        <section className={styles.questions} data-reveal>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>QUESTIONS</span>
            <h2>A few practical details.</h2>
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
          <h2>Open your workspace.</h2>
          <p>Sign in to manage your content, or read the integration guides.</p>
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
