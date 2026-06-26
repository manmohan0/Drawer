export type Shape = {
    id?: number;
    type: 'rectangle';
    startX: number;
    startY: number;
    width: number;
    height: number;
    bg_color?: string;
    color?: string;
    zIndex?: number;
    userId?: string;
    angle?: number;
    updatedByUserId?: string;
} | {
    id?: number;
    type: 'line';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color?: string;
    zIndex?: number;
    userId?: string;
    updatedByUserId?: string;
    angle?: number;
} | {
    id?: number;
    type: 'circle';
    centerX: number;
    centerY: number;
    radius: number;
    bg_color?: string;
    color?: string;
    zIndex?: number;
    userId?: string;
    updatedByUserId?: string;
    angle?: number;
} | {
    id?: number,
    type: 'image',
    url?: string,
    startX: number,
    startY: number,
    width: number,
    height: number
    zIndex?: number;
    userId?: string;
    updatedByUserId?: string;
    angle?: number
} | {
    id?: number;
    type: 'text';
    startX: number;
    startY: number;
    text: string;
    fontSize?: number;
    color?: string;
    zIndex?: number;
    userId?: string;
    updatedByUserId?: string;
}

export type selector = {
    id: number;
    type: 'selector';
    centerX: number;
    centerY: number;
    radius: number;
    angle?: number;
}

export type ShapeType = 'rectangle' | 'line' | 'circle' | 'image' | 'pointer' | 'bucket' | 'text';

export type role = "Viewer" | "Editor" | "Owner";