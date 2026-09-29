import Phaser from 'phaser';
import { playUiClick } from './UiFeedback';

/** 튜토리얼 협상에 진입하기 전, 세션 생성 없이 표시하는 공통 규칙 안내. */
export function showTutorialRules(scene: Phaser.Scene, onStart: () => void): void {
  const { width, height } = scene.scale;
  const cx = width / 2, cy = height / 2;
  const panelWidth = 1120, panelHeight = 920;
  const top = cy - panelHeight / 2;
  const container = scene.add.container(0, 0).setDepth(20000);
  const overlay = scene.add.rectangle(cx, cy, width, height, 0x000000, 0.7).setInteractive();
  const panel = scene.add.image(cx, cy, 'common-panel').setDisplaySize(panelWidth, panelHeight);
  const title = scene.add.text(cx, top + 58, '대화를 시작하기 전에', {
    fontFamily: 'Galmuri11', fontSize: '36px', fontStyle: 'bold', color: '#ffda78',
  }).setOrigin(0.5, 0);
  const subtitle = scene.add.text(cx, top + 113, '목표를 떠올리며, 당신의 말로 상대방과 의논해 보세요.', {
    fontFamily: 'Galmuri11', fontSize: '23px', color: '#e5edf5',
  }).setOrigin(0.5, 0);
  container.add([overlay, panel, title, subtitle]);
  const rules = [
    ['01  대화로 목표 달성하기', '상대방의 사정을 듣고 질문하거나 조건을 제안해 보세요.\n이번 목표에 필요한 합의를 이끌어 내면 성공합니다.'],
    ['02  버튼을 누르고 말하기 · 한 번에 최대 15초', '상대방의 말이 끝나면 ‘말하기 시작’을 누르세요.\n다 말했으면 ‘말 끝내고 보내기’를 누르세요. 15초가 지나면 자동 전송됩니다.'],
    ['03  왼쪽 합의 메모 확인하기', '서로 합의한 내용은 메모에 기록됩니다.\n대화 중 약속을 바꾸거나 취소하면 메모도 달라질 수 있어요.'],
    ['04  제한 시간 안에 협상하기', '협상 제한 시간은 10분입니다.\n남은 시간을 확인하며 목표에 필요한 합의를 이끌어 내세요.'],
    ['05  결과와 나의 말투 확인하기', '대화가 끝나면 성공·실패 결과와 말투 리포트가 나옵니다.\n협상 결과와 별도로, 대화에서 드러난 나의 말투를 살펴보세요.'],
  ];
  rules.forEach(([heading, body], i) => {
    const y = top + 171 + i * 130;
    container.add(scene.add.text(cx - 475, y, heading, {
      fontFamily: 'Galmuri11', fontSize: '26px', fontStyle: 'bold', color: '#ffdf93',
    }));
    container.add(scene.add.text(cx - 475, y + 39, body, {
      fontFamily: 'Galmuri11', fontSize: '23px', color: '#ffffff',
      lineSpacing: 7, wordWrap: { width: 950 },
    }));
  });
  const button = scene.add.image(cx, top + 851, 'button-default').setDisplaySize(560, 78)
    .setInteractive({ useHandCursor: true });
  const label = scene.add.text(cx, top + 851, '대화 시작', {
    fontFamily: 'Galmuri11', fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
  }).setOrigin(0.5);
  container.add([button, label]);
  button.on('pointerover', () => button.setTexture('button-highlight'));
  button.on('pointerout', () => button.setTexture('button-default'));
  button.once('pointerdown', () => {
    button.disableInteractive();
    playUiClick(scene);
    container.destroy();
    onStart();
  });
}
