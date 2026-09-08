/**
 * Imgur image upload utility.
 *
 * Requires VITE_IMGUR_CLIENT_ID to be set in the environment.
 */

export async function uploadToImgur(file: File): Promise<string> {
  const clientId = import.meta.env.VITE_IMGUR_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error("VITE_IMGUR_CLIENT_ID is not set");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("只支援圖片格式");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("圖片大小不可超過 10 MB");
  }

  const formData = new FormData();
  formData.append("image", file);

  let response: Response;
  try {
    response = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${clientId}`,
      },
      body: formData,
    });
  } catch (err) {
    throw new Error(
      `Network error while uploading image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Imgur upload failed: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { data?: { link?: string } };
  if (!json.data?.link) {
    throw new Error("Imgur 回傳格式錯誤，請稍後再試");
  }
  return json.data.link;
}
