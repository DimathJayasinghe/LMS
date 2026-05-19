import styled from "styled-components"

const NavContainer = styled.nav`
    display: inline-block;
    position: relative;
    display: flex;
    justify-content: space-between;
    margin: 1rem;
    border: 1px solid #000;
    border-radius: 3rem;
    max-width: 50rem;
    min-width: fit-content;
    width: 100%;
    margin: 2rem auto;
    background-color: #fff;
`



export default function Nav(){
    return <NavContainer>
        <div>
            <a 
            className="
                flex
                items-center
                justify-center
                bg-black
                text-white
                aspect-square
                w-15
                rounded-full
                align-center
            " 
            href="/home">L</a>
        </div>


        <ul className="flex space-x-6 text-sm  text-gray-700 items-center">
            <li><a href="/home">Home</a></li>
            <li><a href="/about">About us</a></li>
            <li><a href="/courses">Courses</a></li>
            <li><a href="/teachers">Teachers</a></li>
            <li><a href="/contact">Contact us</a></li>
        </ul>

        <a 
        className="
            bg-black
            text-white
            cursor-pointer
            pl-10
            pr-10
            flex
            justify-center
            items-center
            rounded-full
            "
        href="/auth/login">
            login
        </a>
    </NavContainer> 
}