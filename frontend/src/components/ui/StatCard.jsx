export default function StatCard({ title, value, description, icon: Icon, color }) {
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-topline">
        <div>
          <p className="dashboard-stat-title">{title}</p>
          <h3 className="dashboard-stat-value">{value}</h3>
        </div>

        <div className={`dashboard-stat-icon ${color}`}>
          <Icon size={20} aria-hidden="true" />
        </div>
      </div>

      <p className="dashboard-stat-description">{description}</p>
    </div>
  );
}
