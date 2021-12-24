import "../styles/globals.css";

import { ComponentMeta, ComponentStory } from "@storybook/react";

import Header from "../client/Header";
import React from "react";

export default {
  title: "Pounce/Header",
  component: Header,
  argTypes: {},
} as ComponentMeta<typeof Header>;

const Template: ComponentStory<typeof Header> = (args) => {
  return <Header {...args} />;
};

export const PrestartHeader = Template.bind({});
PrestartHeader.args = {
  isStarted: false,
};

export const PoststartHeader = Template.bind({});
PoststartHeader.args = {
  isStarted: true,
};
