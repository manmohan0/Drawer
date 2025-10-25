import React from "react";

interface InputProps {
  type: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Input = ({ type, placeholder, onChange }: InputProps) => {
  return (
    <input
      type={type}
      className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
      onChange={onChange}
      placeholder={placeholder}
    />
  );
};