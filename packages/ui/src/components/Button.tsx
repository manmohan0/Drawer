export const Button = ({ label, onClick } : { label: string, onClick: () => void }) => {
  return <button className="hover:cursor-pointer bg-red-500 px-4 py-2 rounded" onClick={onClick}>{label}</button>
}