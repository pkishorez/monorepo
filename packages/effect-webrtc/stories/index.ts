import { Story } from 'laymos/story';
import { meetingAnotherPeer } from './01-meeting-another-peer/meeting-another-peer.story.js';
import { askingAPeer } from './02-asking-a-peer/asking-a-peer.story.js';
import { eitherPeerCanCall } from './03-either-peer-can-call/either-peer-can-call.story.js';
import { connectingToATeam } from './04-connecting-to-a-team/connecting-to-a-team.story.js';
import { doingWorkConcurrently } from './05-doing-work-concurrently/doing-work-concurrently.story.js';
import { stoppingWorkEarly } from './06-stopping-work-early/stopping-work-early.story.js';

export default Story.group(
  'effect-webrtc',
  {
    description:
      'Connect Effect peers, call typed RPCs over their shared WebRTC session, and follow every interaction through its Flow.',
  },
  [
    meetingAnotherPeer,
    askingAPeer,
    eitherPeerCanCall,
    connectingToATeam,
    doingWorkConcurrently,
    stoppingWorkEarly,
  ],
);
