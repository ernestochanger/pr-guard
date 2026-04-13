export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="badge">NONE</span>;
  }
  return <span className={`badge ${value}`}>{value}</span>;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Not yet";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
