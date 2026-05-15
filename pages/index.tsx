import { useRouter } from "next/router";
import JoinForm from "../client/JoinForm";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
type AppProps = {
  name?: string;
  setName?: (name: string) => void;
};

const Home: NextPage<AppProps> = observer(({ name, setName }: AppProps) => {
  const router = useRouter();
  return (
    <JoinForm
      placeholderName={name ?? ""}
      onSubmit={(room, name) => {
        setName!(name);
        router.push(`/r/${room}`);
      }}
      onPlayOffline={(name) => {
        setName!(name);
        router.push("/offline");
      }}
    />
  );
});

export default Home;
