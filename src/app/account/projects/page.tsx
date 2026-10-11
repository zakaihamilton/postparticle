import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { ProjectSettings } from "@/components/settings/project-settings";

export default async function ProjectSettingsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.platformAdmin) redirect("/account");

  return (
    <AccountArea actor={actor} activeSection="projects">
      <ProjectSettings organizationId={actor.organizationId} />
    </AccountArea>
  );
}
