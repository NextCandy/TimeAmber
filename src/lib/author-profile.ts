export type AuthorProfile = {
  authorName: string;
  authorAvatar: string;
  authorBio: string;
};

export const DEFAULT_AUTHOR_PROFILE: AuthorProfile = {
  authorName: "TA",
  authorAvatar: "",
  authorBio: "仓鼠症",
};

export function resolveAuthorProfile(profile: Partial<AuthorProfile>): AuthorProfile {
  return {
    authorName: profile.authorName?.trim() || DEFAULT_AUTHOR_PROFILE.authorName,
    authorAvatar: profile.authorAvatar?.trim() ?? DEFAULT_AUTHOR_PROFILE.authorAvatar,
    authorBio:
      profile.authorBio === undefined ? DEFAULT_AUTHOR_PROFILE.authorBio : profile.authorBio.trim(),
  };
}

export function getAuthorInitial(authorName: string): string {
  return Array.from(authorName.trim())[0]?.toLocaleUpperCase("zh-CN") ?? "T";
}
