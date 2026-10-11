import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor, minimumAccountPasswordLength } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { YourAccountSettings } from "@/components/settings";
import styles from "@/components/workspace.module.css";

export default async function AccountPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  return (
    <AccountArea actor={actor} activeSection="account">
      <YourAccountSettings
        minimumPasswordLength={minimumAccountPasswordLength()}
      />
      {actor.platformAdmin && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Restore existing content</h2>
          </div>
          <div className={styles.formSection}>
            <p className={styles.subtitle}>
              Recover a missing legacy project and reconnect it to its existing
              content.
            </p>
            <Link
              href="/account/projects#project-recovery"
              className={styles.secondary}
            >
              Open project recovery
            </Link>
          </div>
        </section>
      )}
    </AccountArea>
  );
}
