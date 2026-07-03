import React from 'react';
import { Link } from 'react-router-dom';

export const Splash: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-paper text-ink">
      <div className="max-w-2xl text-center flex flex-col items-center gap-8 animate-fade-in-up">
        
        {/* Simple text hero - no numbers, as per rule */}
        <h1 className="text-hero font-serif tracking-tight text-ink">
          Meet FINVERSE.
        </h1>
        
        <p className="text-section text-muted font-sans font-light max-w-xl">
          Two AI agents, Present You and Future You, negotiate every spending decision using your real financial data.
        </p>

        {/* The single accent color (Gold) CTA */}
        <Link 
          to="/login"
          className="mt-8 px-10 py-5 bg-ink text-paper font-sans font-medium rounded-2xl hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
        >
          Enter the Engine
        </Link>
        
      </div>
    </div>
  );
};
