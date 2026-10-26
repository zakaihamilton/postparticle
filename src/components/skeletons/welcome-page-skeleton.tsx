import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function WelcomePageSkeleton() {
  return (
    <LoadingPage label="Loading welcome page">
      <div className={styles.welcomePage}>
        <header className={styles.welcomeHeader}>
          <div className={styles.brand}>
            <Skeleton width={32} height={32} radius={6} />
            <Skeleton width={132} height={20} />
          </div>
          <nav className={styles.welcomeNav}>
            <Skeleton width={76} height={12} />
            <Skeleton width={92} height={12} />
            <Skeleton width={70} height={12} />
            <Skeleton width={90} height={37} radius={5} />
          </nav>
        </header>
        <main>
          <section className={styles.welcomeHero}>
            <div className={styles.heroCopy}>
              <Skeleton width={184} height={11} />
              <div className={styles.heroTitleLines}>
                <Skeleton width="94%" height={58} radius={8} />
                <Skeleton width="73%" height={58} radius={8} />
              </div>
              <SkeletonLines
                count={3}
                widths={["95%", "86%", "61%"]}
                height={14}
              />
              <div className={styles.heroActions}>
                <Skeleton width={148} height={46} radius={5} />
                <Skeleton width={128} height={18} />
              </div>
              <div className={styles.heroFacts}>
                <Skeleton width={126} height={12} />
                <Skeleton width={144} height={12} />
                <Skeleton width={112} height={12} />
              </div>
            </div>
            <div className={styles.heroProduct}>
              <div className={styles.productBar}>
                <Skeleton width={8} height={8} radius="50%" />
                <Skeleton width={8} height={8} radius="50%" />
                <Skeleton width={8} height={8} radius="50%" />
                <Skeleton width={120} height={11} />
              </div>
              <div className={styles.productWindow}>
                <div className={styles.productRail}>
                  <Skeleton width="76%" height={15} />
                  <Skeleton width="90%" height={10} />
                  <Skeleton width="83%" height={10} />
                  <Skeleton width="72%" height={10} />
                  <Skeleton width="88%" height={10} />
                </div>
                <div className={styles.productQueue}>
                  <Skeleton width="72%" height={13} />
                  <Skeleton width="91%" height={42} radius={5} />
                  <Skeleton width="86%" height={42} radius={5} />
                  <Skeleton width="93%" height={42} radius={5} />
                </div>
                <div className={styles.productPreview}>
                  <Skeleton width="46%" height={11} />
                  <Skeleton width="82%" height={24} />
                  <Skeleton width="100%" height={92} radius={5} />
                  <SkeletonLines
                    count={3}
                    widths={["96%", "87%", "64%"]}
                    height={9}
                  />
                </div>
              </div>
            </div>
          </section>
          <section className={styles.welcomeSection}>
            <div className={styles.sectionIntro}>
              <Skeleton width={153} height={10} />
              <Skeleton width="56%" height={34} />
              <Skeleton width="61%" height={13} />
            </div>
            <div className={styles.stepsList}>
              {[0, 1, 2].map((step) => (
                <div className={styles.stepRow} key={step}>
                  <Skeleton width={40} height={40} radius={7} />
                  <Skeleton width="72%" height={24} />
                  <SkeletonLines count={2} widths={["95%", "77%"]} />
                </div>
              ))}
            </div>
          </section>
          <section className={styles.welcomeSection}>
            <div className={styles.sectionIntro}>
              <Skeleton width={132} height={10} />
              <Skeleton width="60%" height={34} />
            </div>
            {[0, 1].map((row) => (
              <div className={styles.featureRow} key={row}>
                <div className={styles.featureVisual} />
                <div className={styles.heroCopy}>
                  <Skeleton width={176} height={12} />
                  <Skeleton width="85%" height={30} />
                  <SkeletonLines count={3} widths={["96%", "87%", "69%"]} />
                </div>
              </div>
            ))}
          </section>
          <section className={styles.welcomeClosing}>
            <Skeleton width="45%" height={36} />
            <Skeleton width="58%" height={13} />
            <Skeleton width={148} height={45} radius={5} />
          </section>
        </main>
      </div>
    </LoadingPage>
  );
}
