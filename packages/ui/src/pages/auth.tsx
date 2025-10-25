import { Button } from "../components/Button";
import { Input } from "../components/Input";

export const AuthPage = ({ isSignIn } : { isSignIn: boolean }) => {
  return <div className="bg-amber-800 h-screen w-screen flex flex-col justify-center items-center">
    <div className="flex flex-col bg-white p-8 rounded-2xl w-96 shadow-lg">
        <div className="p-2 m-1">
            <Input placeholder={"Email"} onChange={() => console.log("email")} type={"text"}/>
        </div>
        <div className="p-2 m-1">
            <Input placeholder={"Password"} onChange={() => console.log("password")} type={"password"}/>
        </div>
        <Button
            label={isSignIn ? "Sign In" : "Sign Up"}
            onClick={() => console.log(isSignIn ? "Signing In" : "Signing Up")}
        />
    </div>
  </div>;
}