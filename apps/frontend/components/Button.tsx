export const Button = ({ label, onClick, isPrimary = false } : { label: string, onClick: () => void, isPrimary: boolean }) => {
  return <button className={`hover:cursor-pointer ${isPrimary ? "bg-blue-500" : "bg-green-500"} px-4 py-2 rounded`} onClick={onClick}>{label}</button>
}