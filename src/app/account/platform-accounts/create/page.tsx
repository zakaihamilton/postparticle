import { redirect } from "next/navigation";
import { AccountArea } from "@/components/account-area";
import { CreatePlatformAccountSettings } from "@/components/settings";
import { currentActor, minimumAccountPasswordLength } from "@/lib/auth";

export default async function CreatePlatformAccountPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.platformAdmin) redirect("/account");

  return (
    <AccountArea actor={actor} activeSection="platform-accounts">
      <CreatePlatformAccountSettings
        minimumPasswordLength={minimumAccountPasswordLength()}
      />
    </AccountArea>
  );
}
