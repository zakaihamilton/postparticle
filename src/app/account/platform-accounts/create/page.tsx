import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { CreatePlatformAccountSettings } from "@/components/settings";

export default async function CreatePlatformAccountPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.platformAdmin) redirect("/account");

  return (
    <AccountArea actor={actor} activeSection="platform-accounts">
      <CreatePlatformAccountSettings />
    </AccountArea>
  );
}
