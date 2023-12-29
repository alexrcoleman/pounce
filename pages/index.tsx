import { useRouter } from "next/router";
import JoinForm from "../client/JoinForm";
import { observer } from "mobx-react-lite";
import { NextPage, NextPageContext } from "next";

type PageProps = {
  roomId?: string;
};
type AppProps = {
  name?: string;
  setName?: (name: string) => void;
};

const Home: NextPage<PageProps> = observer(
  ({ name, setName, roomId, ...props }: PageProps & AppProps) => {
    console.log(props);
    const router = useRouter();
    return (
      <JoinForm
        placeholderName={name ?? ""}
        placeholderRoomId={roomId}
        onSubmit={(room, name) => {
          setName!(name);
          router.push(`/r/${room}`);
        }}
      />
    );
  }
);

Home.getInitialProps = (ctx: NextPageContext) => {
  return {
    roomId: ctx.query.roomid?.toString(),
  };
};

export default Home;
