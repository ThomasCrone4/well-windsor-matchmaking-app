import { Link } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="bg-white shadow-md py-4 px-6 flex justify-between items-center">
      <Link to="/" className="text-2xl font-bold text-blue-700">
        Well Windsor
      </Link>

      <div className="space-x-50">
        <Link to="/" className="text-gray-700 hover:text-blue-600">
          Opportunities
        </Link>
        <Link to="/auth" className="text-gray-700 hover:text-blue-600">
          Login / Signup
        </Link>
        <Link to="/redirect" className="text-gray-700 hover:text-blue-600">
          Dashboard
        </Link>
      </div>
    </nav>
  )
}
