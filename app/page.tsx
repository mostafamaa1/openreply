import { redirect } from "next/navigation";

/**
 * The site opens on sign-in. The login page sends someone already signed in
 * straight on to the dashboard. Privacy, terms and data-deletion pages stay
 * public at their own paths (Meta's app review links to them).
 */
export default function Home() {
  redirect("/login");
}
