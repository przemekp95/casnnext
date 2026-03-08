import { render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import AuthorsClient from "@/app/autorzy/AuthorsClient";
import type { AuthorRow } from "@/types/author";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    unoptimized?: boolean;
    fill?: boolean;
  }) => <img {...props} alt={props.alt ?? ""} />,
}));

describe("AuthorsClient", () => {
  it("renders portrait author tiles with cover-cropped images", () => {
    const authors: AuthorRow[] = [
      {
        id: "1",
        slug: "autor-z-cms",
        name: "Autor z CMS",
        displayName: "Autor z CMS",
        img: "http://localhost:1337/uploads/autor-z-cms.png",
      },
      {
        id: "2",
        slug: "autor-bez-zdjecia",
        name: "Autor bez zdjęcia",
        displayName: "Autor bez zdjęcia",
        img: null,
      },
    ];

    render(<AuthorsClient authors={authors} />);

    const media = screen.getByTestId("author-card-media-autor-z-cms");
    const image = screen.getByTestId("author-card-image-autor-z-cms");
    const fallback = screen.getByTestId("author-card-image-autor-bez-zdjecia");

    expect(media).toHaveStyle({
      aspectRatio: "4 / 5",
      backgroundColor: "rgb(243, 244, 246)",
    });
    expect(image).toHaveStyle({
      objectFit: "cover",
      objectPosition: "center top",
    });
    expect(fallback).toHaveAttribute("src", "/images/placeholder.png");
  });
});
