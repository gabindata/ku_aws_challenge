import Phaser from 'phaser';

/** 서버 NPC ID와 클라이언트 이미지 폴더의 매핑. 판정 조건은 포함하지 않는다. */
export const NPC_EXPRESSIONS: Record<string, { folder: string; defaultKey: string; keys: string[] }> = {
  store_owner_yang: { folder: 'manager-yang', defaultKey: 'busy', keys: ['busy', 'checking_schedule', 'concerned', 'confirming', 'relieved', 'closed'] },
  ta_han: { folder: 'assistant-han', defaultKey: 'procedural', keys: ['procedural', 'weighing', 'concerned', 'confirming', 'helping', 'closed'] },
  landlord: { folder: 'landlord', defaultKey: 'irritated', keys: ['irritated', 'explaining', 'doubtful', 'confirming', 'relenting', 'turning_away'] },
};

export function npcExpressionTexture(npcId: string, expression?: string): string {
  const config = NPC_EXPRESSIONS[npcId];
  const key = expression && config?.keys.includes(expression) ? expression : config?.defaultKey;
  return `npc:${npcId}:${key}`;
}

export function preloadNpcExpressions(scene: Phaser.Scene): void {
  for (const [npcId, config] of Object.entries(NPC_EXPRESSIONS)) {
    for (const key of config.keys) {
      scene.load.image(npcExpressionTexture(npcId, key),
        `${import.meta.env.BASE_URL}assets/images/npc-portraits/${config.folder}/${key}.png`);
    }
  }
}

/** 투명 여백을 포함한 전체 화면 PNG의 원래 배치를 유지한다. */
export class NpcExpressionController {
  constructor(private scene: Phaser.Scene, private portrait: Phaser.GameObjects.Image, private npcId: string) {
    this.portrait.setPosition(scene.scale.width / 2, scene.scale.height / 2);
    this.setExpression(NPC_EXPRESSIONS[npcId]?.defaultKey ?? '');
  }

  setExpression(expression: string): void {
    const selected = npcExpressionTexture(this.npcId, expression);
    const fallback = npcExpressionTexture(this.npcId);
    const key = this.scene.textures.exists(selected) ? selected : fallback;
    if (this.scene.textures.exists(key)) this.portrait.setTexture(key);
    this.portrait.setDisplaySize(this.scene.scale.width, this.scene.scale.height);
  }
}
