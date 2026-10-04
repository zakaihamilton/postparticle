import Link from "next/link";
import { Brand, Icon, ThemeSwitch } from "@/components/ui";
import { WelcomePreview } from "@/components/welcome-preview";
import styles from "./welcome.module.css";

export default function Welcome() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Welcome navigation">
          <Link className={styles.tourLink} href="#the-workflow">
            How it works
          </Link>
          <Link className={styles.tourLink} href="/developers">
            Developers
          </Link>
          <ThemeSwitch />
          <Link href="/login" className={styles.login}>
            Log in <Icon name="arrow" size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={styles.copy}>
            <div className={styles.eyebrow}>
              <span /> A HOME FOR THE WORK BEFORE IT GOES LIVE
            </div>
            <h1>
              Publish something
              <br />
              <em>worth opening.</em>
            </h1>
            <p>
              Stories, photographs, moving pictures. Give them a place to come
              together, then send them out into the world.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/login">
                Open your workspace <Icon name="arrow" size={18} />
              </Link>
              <Link className={styles.secondary} href="#the-workflow">
                Explore the workflow <Icon name="arrow-down" size={16} />
              </Link>
            </div>
            <div className={styles.note}>
              OPEN SOURCE · YOUR STORAGE · YOUR CONTENT
            </div>
          </div>
          <div className={styles.desk}>
            <div className={styles.marginNote}>
              A small story,
              <br />
              ready for the world.
            </div>
            <WelcomePreview />
            <div className={styles.deskLabel}>
              <span>01 — A STORY IN THE MAKING</span>
              <span>
                Try publishing it <Icon name="arrow-up" size={14} />
              </span>
            </div>
          </div>
        </section>
        <div className={styles.contentIndex}>
          <span>WHAT LIVES HERE</span>
          <Link href="#the-workflow">
            01 <strong>Articles</strong>{" "}
            <Icon name="arrow-up-right" size={16} />
          </Link>
          <Link href="#media">
            02 <strong>Images & video</strong>{" "}
            <Icon name="arrow-up-right" size={16} />
          </Link>
          <Link href="#connected">
            03 <strong>Dynamic content</strong>{" "}
            <Icon name="arrow-up-right" size={16} />
          </Link>
        </div>
        <section id="the-workflow" className={styles.workflow}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>01 / THE EDITORIAL DESK</span>
            <h2>
              A draft is a draft.
              <br />
              <em>Until you say otherwise.</em>
            </h2>
            <p>
              Keep working without changing what your readers see. Save an idea
              today. Put the finishing touches on it tomorrow.
            </p>
          </div>
          <ol className={styles.steps}>
            {[
              {
                title: "Make room for the first draft.",
                text: "Write in Markdown. Add an author, a date, and tags that make the story easy to find.",
              },
              {
                title: "Bring the details together.",
                text: "Choose a cover, check the preview, and set the title and description readers see in search.",
              },
              {
                title: "Make it public. On purpose.",
                text: "Publish a finished version. Your next round of edits stays private until you publish again.",
              },
            ].map((step, i) => (
              <li key={step.title}>
                <span className={styles.stepNumber}>0{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                <Icon name={i === 2 ? "check" : "arrow"} size={19} />
              </li>
            ))}
          </ol>
        </section>
        <section id="media" className={styles.media}>
          <div className={styles.mediaHeading}>
            <div>
              <span className={styles.eyebrow}>02 / THE CONTACT SHEET</span>
              <h2>
                Some things are
                <br />
                better <em>shown.</em>
              </h2>
            </div>
            <p>
              Keep the original, the caption, and the context together. A
              library for images and videos, with room for the details that
              matter.
            </p>
          </div>
          <div
            className={styles.contactSheet}
            aria-label="Example media library"
          >
            <article className={styles.photoOne}>
              <div aria-hidden="true">
                <span className={styles.photoSun} />
                <span className={styles.photoHill} />
              </div>
              <footer>
                <strong>Morning light</strong>
                <span>IMAGE / COVER</span>
              </footer>
            </article>
            <article className={styles.photoTwo}>
              <div aria-hidden="true">
                <span className={styles.arch} />
                <span className={styles.archShadow} />
              </div>
              <footer>
                <strong>Through the archway</strong>
                <span>IMAGE / JOURNAL</span>
              </footer>
            </article>
            <article className={styles.photoThree}>
              <div aria-hidden="true">
                <span className={styles.videoLine} />
                <span className={styles.play}>
                  <Icon name="play" size={35} />
                </span>
                <span className={styles.duration}>00:24</span>
              </div>
              <footer>
                <strong>A moment in motion</strong>
                <span>VIDEO / FIELD NOTES</span>
              </footer>
            </article>
          </div>
          <div className={styles.mediaFoot}>
            <span>
              Illustrative assets. Your library starts with your own files.
            </span>
            <span>ALT TEXT / CAPTIONS / METADATA</span>
          </div>
        </section>
        <section id="connected" className={styles.connected}>
          <div>
            <span className={styles.eyebrow}>03 / OUT IN THE WORLD</span>
            <h2>
              Your website.
              <br />
              <em>With something new to say.</em>
            </h2>
            <p>
              Publish once, then fetch articles or JSON content from your
              website. Keep your own design, routes, and reading experience.
            </p>
            <Link href="/login" className={styles.lightLink}>
              Connect a project <Icon name="arrow" size={18} />
            </Link>
          </div>
          <div
            className={styles.connectionDiagram}
            aria-label="Published content flows from Postparticle to your website"
          >
            <div className={styles.sourceNode}>
              <Brand />
              <span>Published content</span>
            </div>
            <div className={styles.connectionLine}>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.websiteNode}>
              <div>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.sitePicture} />
              <strong>Your next story</strong>
              <span>YOUR WEBSITE</span>
            </div>
            <p>
              Articles + tags + SEO
              <br />
              Named JSON documents
            </p>
          </div>
        </section>
        <section className={styles.questions}>
          <div>
            <span className={styles.eyebrow}>A FEW PRACTICAL THINGS</span>
            <h2>
              Before you
              <br />
              <em>settle in.</em>
            </h2>
          </div>
          <div>
            {[
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
                a: "No. The published-content API supplies the content. Your website decides how to render it. A generic Next.js example is included to help you get started.",
              },
            ].map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <span aria-hidden="true">
                    <Icon name="plus" size={21} />
                  </span>
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.closing}>
          <span className={styles.eyebrow}>THE NEXT STORY IS YOURS.</span>
          <h2>Pull up a chair.</h2>
          <Link className={styles.primary} href="/login">
            Log in to Postparticle <Icon name="arrow" size={18} />
          </Link>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <span>A place for work in progress.</span>
        <Link className={styles.developerFooterLink} href="/developers">
          Developer guides
        </Link>
      </footer>
    </div>
  );
}
