import { Request, Response } from "express";
import { ai } from "../config/gemini.js";

export const generateShapes = async (req: Request, res: Response) => {
  const { prompt } = req.body;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      systemInstruction: `You are an shapes drawing agent who draws shapes on canvas. You will send the shapes in a certain format of this schema
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
                }
                bg_color is the fill color in hex code
                color is the border color in hex code
                You will be given prompt, use this to generate the shapes. And send the shapes in the format of this schema. send it in JSON format with only this type 'types' array not any other thing. JSON will contain a key "shapes" with value as the shapes array. You have to generate random id for each shape. Also for image type you can use image url from internet.
                canvas is of size 4320x2160 px
                `,
      responseMimeType: "application/json",
    },
  });

  const result = response.text;
  if (!result) {
    return res
      .status(400)
      .json({ success: false, message: "No result from AI" });
  }

  console.log(result);

  return res.json({ success: true, shapes: JSON.parse(result) });
};
