import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { ProjectCreationForm } from "@/components/settings/project-creation-form";
import { ProjectSettings } from "@/components/settings/project-settings";
import styles from "@/components/workspace.module.css";

export default async function ProjectSettingsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  return (
    <AccountArea actor={actor} activeSection="projects">
      {actor.platformAdmin ? (
        <ProjectSettings organizationId={actor.organizationId} />
      ) : (
        <>
          <div className={styles.pageHeading}>
            <div>
              <div className={styles.eyebrow}>PROJECT SETUP</div>
              <h1>Create a project</h1>
              <p className={styles.subtitle}>
                Create a project for {actor.organizationName}. You’ll have
                editor access as its creator.
              </p>
            </div>
          </div>
          <ProjectCreationForm />
        </>
      )}
    </AccountArea>
  );
}
