// Shown inside the portal (the side menu stays) while a page loads.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" data-testid="portal-loader">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded-full bg-yarnly-line" />
        <div className="h-9 w-56 rounded-lg bg-yarnly-line" />
      </div>
      <div className="grid grid-cols-2 gap-4 medium:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-32 rounded-2xl border border-yarnly-line bg-white" />
        ))}
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-24 rounded-2xl border border-yarnly-line bg-white" />
      ))}
    </div>
  )
}
