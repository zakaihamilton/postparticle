import { redirect } from "next/navigation";
import { currentActor, minimumAccountPasswordLength } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { YourAccountSettings } from "@/components/settings";

export default async function AccountPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  return (
    <AccountArea actor={actor} activeSection="account">
      <YourAccountSettings
        minimumPasswordLength={minimumAccountPasswordLength()}
      />
    </AccountArea>
  );
}
