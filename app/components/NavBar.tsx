import { Link } from "react-router"

const NavBar = () => {
  return (
    <nav className="navbar">
      <Link to='/'>
        <p className="2xl font-bold text-gradient">Resume Analyzer</p>
      </Link>
      <Link to='/upload' className="primary-button w-fit">
        Upload Resume
      </Link>
    </nav>
  )
}

export default NavBar
