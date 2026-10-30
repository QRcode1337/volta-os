// YouTube Data API v3 channel snapshot served by /api/youtube (and summarised in the /api/sources "YouTube" row).

export interface YouTubeVideo {
  id: string;
  title: string;
  publishedAt: string; // ISO
  views: number;
  likes: number | null; // null when the owner hides likes
  comments: number | null; // null when comments are off
  duration: string; // ISO 8601, e.g. "PT8M12S"
  thumbnail: string | null;
  url: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  handle: string | null; // "@thestrangesttimes373"
  url: string;
  thumbnail: string | null;
  subscribers: number | null; // null when the channel hides its subscriber count
  views: number;
  videoCount: number;
  /** Newest uploads first (at most RECENT_UPLOADS). */
  recent: YouTubeVideo[];
  fetchedAt: string; // ISO
}
