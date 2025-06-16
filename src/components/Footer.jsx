import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-black text-white text-center py-6 mt-12">
      {/* Top link row */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-6 mb-4 text-cyan-400 font-medium text-sm sm:text-base">
        <a
          href="https://www.wellwindsor.org.uk/getintouch"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Contact Us
        </a>
        <a href="#" className="hover:underline">
          FAQ & Support
        </a>
        <a href="#" className="hover:underline">
          Privacy Policy
        </a>
      </div>

      {/* Bottom static line */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 px-4 text-sm sm:text-base">
        <span>Well Windsor Charity</span>
        <span className="hidden sm:inline">|</span>
        <span>Registered Charity number 1207021</span>
        <span className="hidden sm:inline">|</span>
        <a
          href="mailto:hello@wellwindsor.org.uk"
          className="hover:underline text-cyan-400"
        >
          hello@wellwindsor.org.uk
        </a>
      </div>
    </footer>
  );
}
