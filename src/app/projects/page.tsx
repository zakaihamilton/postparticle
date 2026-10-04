import { redirect } from "next/navigation";
import { allowedProjects, currentActor } from "@/lib/auth";
import ProjectPicker from "@/components/project-picker";
export default async function ProjectsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const projects = await allowedProjects(actor);
  return <ProjectPicker actor={actor} projects={projects} />;
}
