import AdminHealthFullPage from "./full/page";

export default function AdminHealthPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AdminHealthFullPage {...props} />;
}
