type EmptyStateProps = {
  icon?: string;
  title: string;
  description: string;
};

export function EmptyState({ icon = "✦", title, description }: EmptyStateProps) {
  return (
    <div className="empty-panel" role="status">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
