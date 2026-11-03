import {Composition, AbsoluteFill, staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {HttpHeroes} from './Composition';
const Video = () => <AbsoluteFill><HttpHeroes/><Audio src={staticFile('narration.mp3')}/></AbsoluteFill>;
export const RemotionRoot = () => <Composition id="HttpHeroes" component={Video} durationInFrames={492} fps={30} width={720} height={1280}/>;
