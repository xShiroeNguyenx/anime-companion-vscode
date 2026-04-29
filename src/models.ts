import * as vscode from 'vscode';

export interface ModelInfo {
  id: string;
  name: string;
  folder: string;
  file: string;
  description: string;
}

export const MODEL_MAP: Record<string, ModelInfo> = {
  hiyori: {
    id: 'hiyori',
    name: 'Hiyori',
    folder: 'Hiyori',
    file: 'Hiyori.model3.json',
    description: 'Cute schoolgirl (Live2D Sample)',
  },
  cheshire: {
    id: 'cheshire',
    name: 'Cheshire',
    folder: 'chaijun_3',
    file: 'chaijun_3.model3.json',
    description: 'Elegant cat maid (Azur Lane)',
  },
  icegirl: {
    id: 'icegirl',
    name: 'Ice Girl',
    folder: 'IceGirl',
    file: 'IceGirl.model3.json',
    description: 'Cute ice girl (TianYeLuLu)',
  },
  tsubaki: {
    id: 'tsubaki',
    name: 'Tsubaki',
    folder: 'Tsubaki',
    file: 'Tsubaki.model3.json',
    description: 'November Camellia (11月椿)',
  },
  whiteangel: {
    id: 'whiteangel',
    name: 'White Angel',
    folder: 'WhiteAngel',
    file: 'WhiteAngel.model3.json',
    description: 'White Hair Angel (白发天使)',
  },
  vivian: {
    id: 'vivian',
    name: 'Vivian',
    folder: 'Vivian',
    file: 'Vivian.model3.json',
    description: 'Vivian (薇薇安)',
  },
  changli: {
    id: 'changli',
    name: 'Changli',
    folder: 'Changli',
    file: 'Changli.model3.json',
    description: 'Changli (长离)',
  },
};

export function getSelectedModel(): ModelInfo {
  const config = vscode.workspace.getConfiguration('animeCompanion');
  const modelId = config.get<string>('model', 'hiyori');
  return MODEL_MAP[modelId] || MODEL_MAP['hiyori'];
}
