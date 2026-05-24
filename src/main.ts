import { Plugin } from 'obsidian';

export default class ObsidianRTC extends Plugin {
  async onload() {
    console.log('ObsidianRTC loaded');
  }

  async onunload() {
    console.log('ObsidianRTC unloaded');
  }
}